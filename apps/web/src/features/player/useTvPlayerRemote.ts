import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { focusElement, primaryIn } from "../tv/focus-engine.ts";
import { remoteKey } from "../tv/remote.ts";
import { useTvBack } from "../tv/useTvBack.ts";
import { SEEK_BADGE_MS, TV_BAR_HIDE_MS, tvPlayerAction } from "./tv-player-keys.ts";

export interface SeekFlash {
  delta: number;
  /** Changes on every jump, so two jumps in a row each show their badge. */
  id: number;
}

interface TvPlayerRemoteOptions {
  /** On a TV, while the film is on screen. */
  enabled: boolean;
  /** A sheet is open over the film (audio and subtitles): it has the remote, the bar stays. */
  sheetOpen: boolean;
  playing: boolean;
  toggle: () => void;
  seekBy: (delta: number) => void;
  /** The controls' layer: its main button (play/pause) takes the focus when the bar shows. */
  bar: RefObject<HTMLElement | null>;
  /** The bar went away: close what was open in it (the reactions). */
  onHide: () => void;
  /** Retour with the bar hidden: leave the film. */
  onLeave: () => void;
}

/** The player's remote on a TV (see tv-player-keys.ts): returns whether the bar shows, and the last ±10 s jump. */
export function useTvPlayerRemote({
  enabled,
  sheetOpen,
  playing,
  toggle,
  seekBy,
  bar,
  onHide,
  onLeave,
}: TvPlayerRemoteOptions) {
  const [shown, setShown] = useState(false);
  const [activity, setActivity] = useState(0);
  const [seek, setSeek] = useState<SeekFlash | null>(null);
  const latest = useRef({ shown, toggle, seekBy, onHide });
  latest.current = { shown, toggle, seekBy, onHide };

  const hide = useCallback(() => {
    setShown(false);
    latest.current.onHide();
    const active = document.activeElement;
    if (active instanceof HTMLElement && bar.current?.contains(active)) active.blur();
  }, [bar]);

  // Keys go to the film before anything else (capture), unless a sheet holds the remote.
  useEffect(() => {
    if (!enabled || sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const { shown: barShown } = latest.current;
      if (barShown) setActivity((n) => n + 1);
      const action = tvPlayerAction(remoteKey(event.key), barShown);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action.kind === "toggle") latest.current.toggle();
      if (action.kind === "showBar") setShown(true);
      if (action.kind === "seek") {
        latest.current.seekBy(action.delta);
        setSeek({ delta: action.delta, id: performance.now() });
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [enabled, sheetOpen]);

  // The bar comes up with the focus on play/pause.
  useEffect(() => {
    if (!shown || !bar.current) return;
    const frame = requestAnimationFrame(() => {
      const start = bar.current && primaryIn(bar.current);
      if (start) focusElement(start);
    });
    return () => cancelAnimationFrame(frame);
  }, [shown, bar]);

  // While the film plays, the bar fades after 5 s without a key.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `activity` is the reset signal of the timer.
  useEffect(() => {
    if (!shown || !playing || sheetOpen) return;
    const timer = setTimeout(hide, TV_BAR_HIDE_MS);
    return () => clearTimeout(timer);
  }, [shown, playing, sheetOpen, activity, hide]);

  useEffect(() => {
    if (!seek) return;
    const timer = setTimeout(() => setSeek(null), SEEK_BADGE_MS);
    return () => clearTimeout(timer);
  }, [seek]);

  // Leaving the film (or the TV) puts the bar away.
  useEffect(() => {
    if (!enabled) setShown(false);
  }, [enabled]);

  useTvBack(() => {
    if (shown) hide();
    else onLeave();
    return true;
  }, enabled);

  return { shown, seek };
}
