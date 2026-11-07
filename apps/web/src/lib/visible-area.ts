/** The part of the screen left visible by an on-screen keyboard: where a bottom sheet must sit. */
export interface VisibleArea {
  top: number;
  height: number;
}

/**
 * The visible area when a keyboard covers the bottom of the page, else null.
 * Safari (iPhone, iPad) leaves the page as is and only shrinks its visual
 * viewport; Chrome on Android, told `interactive-widget=resizes-content`,
 * shrinks the page itself and needs nothing here.
 */
export function visibleArea(
  innerHeight: number,
  viewport: { height: number; offsetTop: number } | null,
): VisibleArea | null {
  if (!viewport) return null;
  const covered = innerHeight - viewport.height - viewport.offsetTop;
  // A pixel or two of rounding is not a keyboard.
  return covered > 2 ? { top: viewport.offsetTop, height: viewport.height } : null;
}
