import { useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Another page, not just another tab of the same one (`/liste` → `/liste?vus`):
 * only then does the screen start at the top.
 */
export function isNewPage(previousPath: string, path: string): boolean {
  return previousPath !== path;
}

/**
 * Each page opens at its top. The document scrolls, not each screen, so
 * without this the next page kept the scroll of the last one: the bottom of
 * « Nous », then « Notre liste » opened at its bottom too.
 */
export function useTopOfNewPage(): void {
  const [path] = useLocation();
  const previous = useRef(path);
  useLayoutEffect(() => {
    if (!isNewPage(previous.current, path)) return;
    previous.current = path;
    window.scrollTo({ top: 0, left: 0 });
  }, [path]);
}
