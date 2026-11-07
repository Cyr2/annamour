import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { backTarget, runBackHandlers } from "./back.ts";
import { moveFocus, settleFocus } from "./focus-engine.ts";
import { isDirection, isEditable, remoteKey } from "./remote.ts";
import { notifyBackHandled } from "./tv-mode.ts";

/**
 * The remote, app-wide (TV mode only): the arrows move the focus across the
 * screen, OK presses what has the focus (the browser does it), and Retour
 * closes what is open, goes back, or leaves the app from the home screen.
 * Screens with their own remote (the player) handle the keys first and mark
 * them `defaultPrevented`.
 */
export function TvRemote() {
  const [location, navigate] = useLocation();
  const route = useRef({ location, navigate });
  route.current = { location, navigate };
  /** Whether the remote was used on this screen yet: until then, the focus follows the screen's main action. */
  const touched = useRef(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = remoteKey(event.key, isEditable(document.activeElement));
      if (!key) return;
      touched.current = true;
      if (key === "back") {
        // Sheets and menus close themselves on Escape (and say so with preventDefault): decide once they all had their turn.
        setTimeout(() => {
          if (event.defaultPrevented || runBackHandlers()) return notifyBackHandled();
          const target = backTarget(route.current.location);
          if (target === null) return;
          route.current.navigate(target);
          notifyBackHandled();
        }, 0);
        return;
      }
      if (event.defaultPrevented || !isDirection(key)) return;
      // In a text field, ← and → move the caret.
      if ((key === "left" || key === "right") && isEditable(document.activeElement)) return;
      event.preventDefault();
      moveFocus(key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useFocusFollowsScreen(location, touched);
  return null;
}

/**
 * The focus is never lost on a TV: when a screen opens (or its main action
 * appears, e.g. once the séances load), the main action takes the focus;
 * when the focused element goes away, the screen's main action or first
 * control takes it back. The film, which runs its own remote, is left alone.
 */
function useFocusFollowsScreen(location: string, touched: { current: boolean }): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new screen (`location`) starts untouched, on its main action.
  useEffect(() => {
    touched.current = false;
    let frame = 0;
    const settle = () => {
      frame = 0;
      // The film runs its own remote.
      if (!document.querySelector("[data-watching]")) settleFocus(touched.current);
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(settle);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["inert", "disabled", "aria-modal"],
    });
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [location, touched]);
}
