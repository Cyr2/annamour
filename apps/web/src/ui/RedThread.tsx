import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { createContext, type ReactNode, use, useCallback, useLayoutEffect, useRef, useState } from "react";
import { spring } from "../lib/motion.ts";
import { cx } from "./cx.ts";
import { KNOT_ATTRIBUTE, knotPoint, type Point, threadPath } from "./thread-path.ts";

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

/** Peak wave height while slack, and how far the thread droops, in px. */
const SLACK_AMPLITUDE = 7;
const SLACK_SAG = 16;

function Line({ className }: { className?: string }) {
  const {
    state: { synced, points },
  } = useThread();
  const reduceMotion = useReducedMotion() ?? false;

  const amplitude = useSpring(synced ? 0 : SLACK_AMPLITUDE, spring.thread);
  const sag = useSpring(synced ? 0 : SLACK_SAG, spring.thread);
  const d = useMotionValue("");
  const last = useRef("");

  useLayoutEffect(() => {
    const amp = synced ? 0 : SLACK_AMPLITUDE;
    const droop = synced ? 0 : SLACK_SAG;
    if (reduceMotion) {
      amplitude.jump(amp);
      sag.jump(droop);
    } else {
      amplitude.set(amp);
      sag.set(droop);
    }
  }, [synced, reduceMotion, amplitude, sag]);

  useAnimationFrame((time) => {
    if (points.length < 2) return;
    // With reduced motion the slack thread is drawn still: a frozen wave.
    const next = threadPath(points, sag.get(), amplitude.get(), reduceMotion ? 0 : time);
    if (next !== last.current) {
      last.current = next;
      d.set(next);
    }
  });

  if (points.length < 2) return null;

  return (
    // Filters go on a wrapper, not the animated SVG, so the path repaints cheaply.
    <div
      aria-hidden
      className={cx("pointer-events-none absolute inset-0 z-0", className)}
      style={{ filter: "drop-shadow(0 0 6px var(--am-thread-glow))" }}
    >
      <svg className="h-full w-full overflow-visible" aria-hidden="true">
        <motion.path
          d={d}
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
