import { useEffect, useState } from "react";
import { type VisibleArea, visibleArea } from "../lib/visible-area.ts";

/**
 * Follows the on-screen keyboard while `active`: the area left visible above
 * it, or null when no keyboard covers the page.
 */
export function useVisibleArea(active: boolean): VisibleArea | null {
  const [area, setArea] = useState<VisibleArea | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return;
    const update = () => setArea(visibleArea(window.innerHeight, viewport));
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      setArea(null);
    };
  }, [active]);

  return area;
}
