import type { Direction } from "./remote.ts";
import { type Box, nextIndex } from "./spatial.ts";

/*
 * Spatial navigation, the DOM side: what can take the focus on screen right
 * now, and moving it with the arrows. It works on the real focus (buttons,
 * links, fields), so the screens need nothing special: an open dialog keeps
 * the focus inside it, and `data-tv-primary` marks where a screen starts.
 */

const CANDIDATES = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]';
/** A screen's main action: the focus starts there. A higher value wins when several are on screen. */
export const PRIMARY_ATTRIBUTE = "data-tv-primary";

function boxOf(element: Element): Box {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
}

/** Can the remote land on this element right now: enabled, reachable, laid out and visible. */
export function isFocusable(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[inert]")) return false;
  const { width, height } = element.getBoundingClientRect();
  if (width <= 0 || height <= 0) return false;
  return typeof element.checkVisibility === "function" ? element.checkVisibility({ visibilityProperty: true }) : true;
}

/** Where the focus may go: the open dialog when there is one, otherwise the whole page. */
export function activeScope(root: Document = document): Element {
  const dialogs = root.querySelectorAll('[aria-modal="true"]');
  return dialogs[dialogs.length - 1] ?? root.body;
}

export function focusablesIn(scope: Element): HTMLElement[] {
  return Array.from(scope.querySelectorAll(CANDIDATES)).filter(isFocusable);
}

/** The element itself when focusable, else the first focusable inside it. */
function focusTargetOf(element: Element): HTMLElement | null {
  if (isFocusable(element)) return element;
  return Array.from(element.querySelectorAll(CANDIDATES)).find(isFocusable) ?? null;
}

/** The screen's main action in `scope`: the highest `data-tv-primary`, the first in the page on a tie. */
export function primaryIn(scope: Element): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestRank = Number.NEGATIVE_INFINITY;
  for (const marked of Array.from(scope.querySelectorAll(`[${PRIMARY_ATTRIBUTE}]`))) {
    const rank = Number(marked.getAttribute(PRIMARY_ATTRIBUTE)) || 1;
    if (rank <= bestRank) continue;
    const target = focusTargetOf(marked);
    if (target) {
      best = target;
      bestRank = rank;
    }
  }
  return best;
}

/** Focuses without scrolling the page sideways; the row it is in scrolls instead. */
export function focusElement(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

/**
 * Keeps the focus where a remote can use it. Until the remote is `touched`
 * on a screen, its main action holds the focus (even one that appears late,
 * like the « Reprendre » card); after that, only a lost focus (on nothing,
 * outside an open dialog, on an element gone or disabled) is put back.
 */
export function settleFocus(touched: boolean, root: Document = document): void {
  const scope = activeScope(root);
  const active = root.activeElement;
  const lost = !active || active === root.body || !scope.contains(active) || !isFocusable(active);
  if (touched && !lost) return;
  const target = primaryIn(scope) ?? (lost ? focusablesIn(scope)[0] : undefined);
  if (target && target !== active) focusElement(target);
}

/**
 * Moves the focus one step with an arrow. With nothing focused yet, the
 * screen's main action (or its first control) takes it. Returns false when
 * there is nothing that way.
 */
export function moveFocus(direction: Direction, root: Document = document): boolean {
  const scope = activeScope(root);
  const items = focusablesIn(scope);
  const current = root.activeElement;
  const from = current && items.find((item) => item === current);
  if (!from) {
    const start = primaryIn(scope) ?? items[0];
    if (start) focusElement(start);
    return start !== undefined;
  }
  const others = items.filter((item) => item !== from);
  const index = nextIndex(boxOf(from), others.map(boxOf), direction);
  const target = others[index];
  if (!target) return false;
  focusElement(target);
  return true;
}
