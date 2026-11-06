import { useEffect, useRef } from "react";
import { keyAction, type PlayerKeys } from "./player-keys.ts";

/** Wires the player shortcuts to the window while the film is on screen; ignored while typing in a field. */
export function usePlayerKeyboard(active: boolean, keys: PlayerKeys): void {
  const latest = useRef(keys);
  latest.current = keys;

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || target?.closest("input, textarea, [role=slider], [role=menu]")) return;
      const action = keyAction(event.key, latest.current);
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}

/** Full screen for the whole player; iPhone only knows full screen on the video itself. */
export function toggleFullscreen(video: HTMLVideoElement | null): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
    return;
  }
  const root = document.documentElement;
  if (root.requestFullscreen) {
    void root.requestFullscreen().catch(() => {});
    return;
  }
  const webkitVideo = video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
  webkitVideo?.webkitEnterFullscreen?.();
}
