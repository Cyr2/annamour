import type { HTMLAttributes, Ref } from "react";
import { cx } from "./cx.ts";

/**
 * Glass for large surfaces (cards, panels, the player's capsule): frosted
 * (backdrop blur, saturation, a lit rim and a soft inner highlight), with no
 * SVG refraction. glisse's refraction is redrawn every frame and costs too
 * much over a whole card on a phone; small controls keep it (see controls.tsx).
 */
export function Surface({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return <div ref={ref} {...props} className={cx("am-frost", className)} />;
}
