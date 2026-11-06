import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { createContext, type ReactNode, use, useCallback, useLayoutEffect, useRef, useState } from "react";
import { spring } from "../lib/motion.ts";
import { cx } from "./cx.ts";

/*
 * The red thread: drawn between two anchors (the presence bubbles). Taut when
 * everyone is in sync; slack and gently waving while someone is catching up.
 *
 *   <RedThread.Root synced={synced}>
 *     <RedThread.Line />
 *     <RedThread.Anchor end="start"><PresenceBubble … /></RedThread.Anchor>
 *     <RedThread.Anchor end="end"><PresenceBubble … /></RedThread.Anchor>
 *   </RedThread.Root>
 */

type End = "start" | "end";
interface Point {
  x: number;
  y: number;
  /** Radius of the anchor: the thread is tied at its rim, not its centre. */
  r: number;
}
interface Ends {
  start: Point;
  end: Point;
}

interface ThreadContextValue {
  state: { synced: boolean; ends: Ends | null };
  actions: { register: (end: End, el: HTMLElement | null) => void };
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

function useThread(): ThreadContextValue {
  const ctx = use(ThreadContext);
  if (!ctx) throw new Error("RedThread parts must be inside <RedThread.Root>");
  return ctx;
}

/* ---------- Root ---------- */

interface RootProps {
  synced: boolean;
  className?: string;
  children: ReactNode;
}

function Root({ synced, className, children }: RootProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchors = useRef<Record<End, HTMLElement | null>>({ start: null, end: null });
  const [ends, setEnds] = useState<Ends | null>(null);

  const measure = useCallback(() => {
    const root = rootRef.current;
    const { start, end } = anchors.current;
    if (!root || !start || !end) return;
    const box = root.getBoundingClientRect();
    const centre = (el: HTMLElement): Point => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left - box.left + r.width / 2),
        y: Math.round(r.top - box.top + r.height / 2),
        // Layout size, not the box: an entering bubble may still be scaled down.
        r: Math.round(Math.min(el.offsetWidth, el.offsetHeight) / 2),
      };
    };
    const next = { start: centre(start), end: centre(end) };
    setEnds((prev) =>
      prev &&
      prev.start.x === next.start.x &&
      prev.start.y === next.start.y &&
      prev.start.r === next.start.r &&
      prev.end.x === next.end.x &&
      prev.end.y === next.end.y &&
      prev.end.r === next.end.r
        ? prev
        : next,
    );
  }, []);

  const observer = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(measure);
    observer.current = ro;
    if (rootRef.current) ro.observe(rootRef.current);
    for (const el of Object.values(anchors.current)) if (el) ro.observe(el);
    measure();
    return () => {
      ro.disconnect();
      observer.current = null;
    };
  }, [measure]);

  const register = useCallback(
    (end: End, el: HTMLElement | null) => {
      const prev = anchors.current[end];
      if (prev === el) return;
      if (prev) observer.current?.unobserve(prev);
      anchors.current[end] = el;
      if (el) observer.current?.observe(el);
      measure();
    },
    [measure],
  );

  return (
    <ThreadContext value={{ state: { synced, ends }, actions: { register } }}>
      <div ref={rootRef} className={cx("relative isolate", className)}>
        {children}
      </div>
    </ThreadContext>
  );
}

/* ---------- Anchor ---------- */

interface AnchorProps {
  end: End;
  className?: string;
  children: ReactNode;
}

function Anchor({ end, className, children }: AnchorProps) {
  const {
    actions: { register },
  } = useThread();
  const ref = useCallback((el: HTMLDivElement | null) => register(end, el), [end, register]);
  return (
    <div ref={ref} className={cx("relative z-10", className)}>
      {children}
    </div>
  );
}

/* ---------- Line ---------- */

const SEGMENTS = 40;
/** Peak wave height while slack, and how far the thread droops, in px. */
const SLACK_AMPLITUDE = 7;
const SLACK_SAG = 16;

function threadPath(ends: Ends, sag: number, amplitude: number, time: number): string {
  const centreDx = ends.end.x - ends.start.x;
  const centreDy = ends.end.y - ends.start.y;
  const centreLength = Math.hypot(centreDx, centreDy) || 1;
  const ux = centreDx / centreLength;
  const uy = centreDy / centreLength;
  const start = { x: ends.start.x + ux * ends.start.r, y: ends.start.y + uy * ends.start.r };
  const end = { x: ends.end.x - ux * ends.end.r, y: ends.end.y - uy * ends.end.r };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  // Unit normal, oriented so a positive offset hangs downwards.
  let nx = -dy / length;
  let ny = dx / length;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  let d = "";
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const envelope = Math.sin(Math.PI * t); // ends stay tied to the anchors
    const wave =
      Math.sin(2 * Math.PI * 1.5 * t - time * 0.0032) + 0.35 * Math.sin(2 * Math.PI * 2.6 * t + time * 0.0021);
    const offset = envelope * (sag + amplitude * wave);
    const x = start.x + dx * t + nx * offset;
    const y = start.y + dy * t + ny * offset;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

function Line({ className }: { className?: string }) {
  const {
    state: { synced, ends },
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
    if (!ends) return;
    // With reduced motion the slack thread is drawn still: a frozen wave.
    const next = threadPath(ends, sag.get(), amplitude.get(), reduceMotion ? 0 : time);
    if (next !== last.current) {
      last.current = next;
      d.set(next);
    }
  });

  if (!ends) return null;

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
          animate={{ opacity: synced ? 1 : 0.7 }}
          transition={spring.ui}
        />
      </svg>
    </div>
  );
}

export const RedThread = { Root, Anchor, Line };
