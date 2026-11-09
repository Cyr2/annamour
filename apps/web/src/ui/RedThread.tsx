import { type MotionValue, m, useReducedMotion, useSpring } from "motion/react";
import { createContext, type ReactNode, use, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { spring } from "../lib/motion.ts";
import { useCalmMotion } from "./calm-motion.ts";
import { cx } from "./cx.ts";
import { KNOT_ATTRIBUTE, knotPoint, type Point, type ThreadSway, threadPath } from "./thread-path.ts";

/*
 * The red thread: drawn from bubble to bubble, in the order of their `index`.
 * Taut when everyone is in sync; slack and gently waving while someone is
 * catching up (or while the other end is still empty).
 *
 *   <RedThread.Root synced={synced}>
 *     <RedThread.Line />
 *     <RedThread.Anchor index={0}><PresenceBubble … /></RedThread.Anchor>
 *     <RedThread.Anchor index={1}><PresenceBubble … /></RedThread.Anchor>
 *   </RedThread.Root>
 */

interface ThreadContextValue {
  state: { synced: boolean; points: Point[] };
  actions: { register: (index: number, el: HTMLElement | null) => void };
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

function useThread(): ThreadContextValue {
  const ctx = use(ThreadContext);
  if (!ctx) throw new Error("RedThread parts must be inside <RedThread.Root>");
  return ctx;
}

function samePoints(a: Point[], b: Point[]): boolean {
  return a.length === b.length && a.every((p, i) => p.x === b[i]?.x && p.y === b[i]?.y && p.r === b[i]?.r);
}

/* ---------- Root ---------- */

interface RootProps {
  synced: boolean;
  className?: string;
  children: ReactNode;
}

function Root({ synced, className, children }: RootProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchors = useRef(new Map<number, HTMLElement>());
  const [points, setPoints] = useState<Point[]>([]);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const next = [...anchors.current.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, el]): Point => {
        // Tie onto the bubble itself, not the whole anchor (a caption under it would pull the thread down).
        const knot = el.querySelector<HTMLElement>(`[${KNOT_ATTRIBUTE}]`) ?? el;
        return knotPoint(box, knot.getBoundingClientRect(), { width: knot.offsetWidth, height: knot.offsetHeight });
      });
    setPoints((prev) => (samePoints(prev, next) ? prev : next));
  }, []);

  const observer = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(measure);
    observer.current = ro;
    if (rootRef.current) ro.observe(rootRef.current);
    for (const el of anchors.current.values()) ro.observe(el);
    measure();
    return () => {
      ro.disconnect();
      observer.current = null;
    };
  }, [measure]);

  const register = useCallback(
    (index: number, el: HTMLElement | null) => {
      const prev = anchors.current.get(index);
      if (prev === el) return;
      if (prev) observer.current?.unobserve(prev);
      if (el) {
        anchors.current.set(index, el);
        observer.current?.observe(el);
      } else {
        anchors.current.delete(index);
      }
      measure();
    },
    [measure],
  );

  return (
    <ThreadContext value={{ state: { synced, points }, actions: { register } }}>
      <div ref={rootRef} className={cx("relative isolate", className)}>
        {children}
      </div>
    </ThreadContext>
  );
}

/* ---------- Anchor ---------- */

interface AnchorProps {
  /** Position along the thread: anchors are joined in increasing order. */
  index: number;
  className?: string;
  children: ReactNode;
}

function Anchor({ index, className, children }: AnchorProps) {
  const {
    actions: { register },
  } = useThread();
  const ref = useCallback((el: HTMLDivElement | null) => register(index, el), [index, register]);
  return (
    <div ref={ref} className={cx("relative z-10", className)}>
      {children}
    </div>
  );
}

/* ---------- Line ---------- */

/** Peak sway while slack, and how far the thread droops, in px: a gentle thread barely breathes. */
const SLACK: Record<ThreadSway, { amplitude: number; sag: number }> = {
  wave: { amplitude: 7, sag: 16 },
  gentle: { amplitude: 3, sag: 10 },
};

/**
 * Draws the thread frame by frame while it moves, written straight onto the
 * paths (a motion value lost the single write of a still thread while
 * Motion's features were loading). A still thread (reduced motion, TV) that
 * has settled asks for no more frames: on a TV each one is a full-screen
 * redraw. Its springs moving wake it up.
 */
function useThreadDrawing(
  points: Point[],
  sag: MotionValue<number>,
  amplitude: MotionValue<number>,
  still: boolean,
  sway: ThreadSway,
) {
  const lineRef = useRef<SVGPathElement>(null);
  const haloRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (points.length < 2) return;
    let frame = 0;
    const draw = (time: number) => {
      frame = 0;
      const line = lineRef.current;
      if (!line) return;
      const next = threadPath(points, sag.get(), amplitude.get(), still ? 0 : time, sway);
      if (line.getAttribute("d") !== next) {
        line.setAttribute("d", next);
        haloRef.current?.setAttribute("d", next);
      }
      const settled = still && !sag.isAnimating() && !amplitude.isAnimating();
      if (!settled) frame = requestAnimationFrame(draw);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    wake();
    const stopSag = sag.on("change", wake);
    const stopAmplitude = amplitude.on("change", wake);
    return () => {
      cancelAnimationFrame(frame);
      stopSag();
      stopAmplitude();
    };
  }, [points, sag, amplitude, still, sway]);

  return { lineRef, haloRef };
}

/** `sway="gentle"` for a thread that only waits (an empty state), not one where someone is loading. */
function Line({ className, sway = "wave" }: { className?: string; sway?: ThreadSway }) {
  const {
    state: { synced, points },
  } = useThread();
  const reduceMotion = useReducedMotion() ?? false;
  const calm = useCalmMotion();
  // On a TV the wave would repaint the thread on every frame for as long as a seat is empty: it droops, still.
  const stillWave = reduceMotion || calm;
  const slack = SLACK[sway];

  const amplitude = useSpring(synced ? 0 : slack.amplitude, spring.thread);
  const sag = useSpring(synced ? 0 : slack.sag, spring.thread);
  const { lineRef, haloRef } = useThreadDrawing(points, sag, amplitude, stillWave, sway);

  useLayoutEffect(() => {
    const amp = synced ? 0 : slack.amplitude;
    const droop = synced ? 0 : slack.sag;
    if (reduceMotion) {
      amplitude.jump(amp);
      sag.jump(droop);
    } else {
      amplitude.set(amp);
      sag.set(droop);
    }
  }, [synced, reduceMotion, amplitude, sag, slack]);

  if (points.length < 2) return null;

  return (
    // Filters go on a wrapper, not the animated SVG, so the path repaints cheaply.
    <div aria-hidden className={cx("am-thread-line pointer-events-none absolute inset-0 z-0", className)}>
      <svg className="h-full w-full overflow-visible" aria-hidden="true">
        <path ref={haloRef} fill="none" strokeLinecap="round" strokeLinejoin="round" className="am-thread-halo" />
        <m.path
          ref={lineRef}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-thread"
          animate={{ opacity: synced ? 1 : 0.72 }}
          transition={spring.ui}
        />
      </svg>
    </div>
  );
}

export const RedThread = { Root, Anchor, Line };
