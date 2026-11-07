/*
 * What the bench records inside the page, from its first script on: every
 * frame's length (requestAnimationFrame), each key's time to the next paint
 * (Event Timing), long tasks, and when the focus last moved. Serialised into
 * the page by `addInitScript`, so it must not close over anything.
 */

export interface KeyTiming {
  /** Key down to the frame that shows its effect, in ms (input delay + handlers + rendering). */
  duration: number;
  /** Time spent in the handlers alone. */
  processing: number;
}

export interface SlowFrame {
  duration: number;
  /** From the start of rendering to the frame's end (style, layout, paint). */
  render: number;
  styleAndLayout: number;
  scripts: string[];
}

export interface PageProbe {
  frames: number[];
  keys: KeyTiming[];
  longTasks: number[];
  /** Frames over 50 ms, and what took the time: scripts, then style and layout, then painting. */
  slowFrames: SlowFrame[];
  lastKeyAt: number;
  lastFocusAt: number;
  firstFocusAt: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
}

declare global {
  interface Window {
    __perf: PageProbe;
  }
}

export function installProbe(): void {
  const probe: PageProbe = {
    frames: [],
    keys: [],
    longTasks: [],
    slowFrames: [],
    lastKeyAt: 0,
    lastFocusAt: 0,
    firstFocusAt: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
  };
  window.__perf = probe;

  let last = performance.now();
  const frame = (now: number) => {
    probe.frames.push(now - last);
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  addEventListener("keydown", () => (probe.lastKeyAt = performance.now()), { capture: true });
  addEventListener(
    "focusin",
    () => {
      probe.lastFocusAt = performance.now();
      if (!probe.firstFocusAt) probe.firstFocusAt = probe.lastFocusAt;
    },
    { capture: true },
  );

  const observe = (type: string, onEntry: (entry: PerformanceEntry) => void, options: object = {}) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({
        type,
        buffered: true,
        ...options,
      });
    } catch {
      // Not every browser knows every entry type.
    }
  };
  observe(
    "event",
    (entry) => {
      if (entry.name !== "keydown") return;
      const timing = entry as PerformanceEventTiming;
      probe.keys.push({ duration: timing.duration, processing: timing.processingEnd - timing.processingStart });
    },
    { durationThreshold: 16 },
  );
  observe("longtask", (entry) => probe.longTasks.push(entry.duration));
  observe("long-animation-frame", (entry) => {
    const frame = entry as PerformanceEntry & {
      renderStart: number;
      styleAndLayoutStart: number;
      scripts: { invoker: string; sourceFunctionName: string; sourceURL: string; duration: number }[];
    };
    probe.slowFrames.push({
      duration: Math.round(frame.duration),
      render: Math.round(frame.startTime + frame.duration - (frame.renderStart || frame.startTime + frame.duration)),
      styleAndLayout: Math.round(
        frame.startTime + frame.duration - (frame.styleAndLayoutStart || frame.startTime + frame.duration),
      ),
      scripts: frame.scripts.map(
        (script) =>
          `${Math.round(script.duration)}ms ${script.invoker} ${script.sourceFunctionName} ${script.sourceURL.split("/").pop() ?? ""}`,
      ),
    });
  });
  observe("paint", (entry) => {
    if (entry.name === "first-contentful-paint") probe.firstContentfulPaint = entry.startTime;
  });
  observe("largest-contentful-paint", (entry) => (probe.largestContentfulPaint = entry.startTime));
}
