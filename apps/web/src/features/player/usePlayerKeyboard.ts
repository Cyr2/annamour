import { useEffect, useRef } from "react";
import { keyAction, type PlayerKeys, type SurfacePress, tapToggles } from "./player-keys.ts";

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

/**
 * A tap or click on the film itself (not on a control) plays or pauses, for
 * everyone, once the controls are in sight (see tapToggles). The press is read
 * before the window wakes the controls, so a first tap only brings them back.
 */
export function useSurfaceTap(onTap: () => void, controlsHidden: boolean) {
  const press = useRef<SurfacePress>({ onSurface: false, controlsHidden: false });
  return {
    onPointerDown: (event: { target: EventTarget; currentTarget: EventTarget }) => {
      press.current = { onSurface: event.target === event.currentTarget, controlsHidden };
    },
    onClick: (event: { target: EventTarget; currentTarget: EventTarget }) => {
      if (tapToggles(press.current, event.target === event.currentTarget)) onTap();
      press.current = { onSurface: false, controlsHidden: false };
    },
  };
}
