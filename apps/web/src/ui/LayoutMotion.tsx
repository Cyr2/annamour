import { LazyMotion } from "motion/react";
import { type ReactNode, useState } from "react";

const loadLayoutFeatures = () => import("../lib/motion-layout.ts").then((m) => m.default);

interface LayoutMotionProps {
  children: ReactNode;
  /** Waits for this before loading, e.g. the first toast. Loads on mount without it. */
  when?: () => Promise<unknown>;
}

/**
 * Motion's layout engine (`layout` props) on top of the app's lighter
 * animation engine (main.tsx). Once loaded it gives every animated element a
 * projection node, which cost ~80 ms of a phone's launch: so only the lists
 * that animate their layout load it, and only once they need it. Children
 * re-render when it arrives, ready for their next layout change.
 */
export function LayoutMotion({ children, when }: LayoutMotionProps) {
  // LazyMotion reads its features once, on mount.
  const [features] = useState(() => (when ? () => when().then(loadLayoutFeatures) : loadLayoutFeatures));
  return (
    <LazyMotion features={features} strict>
      {children}
    </LazyMotion>
  );
}
