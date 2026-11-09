export interface PlayerKeys {
  toggle: () => void;
  seekBy: (delta: number) => void;
  toggleMute: () => void;
  fullscreen: () => void;
}

/** Where a press on the film began: on the picture itself, and whether the controls were out of sight then. */
export interface SurfacePress {
  onSurface: boolean;
  controlsHidden: boolean;
}

/**
 * Whether a tap on the film plays or pauses for everyone. With the controls
 * hidden, the tap only brings them back: pausing a whole room to see the time
 * would be a surprise. A drag that began on a control or ended off the film is no tap.
 */
export function tapToggles(press: SurfacePress, releasedOnSurface: boolean): boolean {
  return press.onSurface && !press.controlsHidden && releasedOnSurface;
}

/** Space or K: play/pause · ← →: 10 s · M: mute · F: full screen. */
export function keyAction(key: string, keys: PlayerKeys): (() => void) | null {
  switch (key) {
    case " ":
    case "k":
      return keys.toggle;
    case "ArrowLeft":
      return () => keys.seekBy(-10);
    case "ArrowRight":
      return () => keys.seekBy(10);
    case "m":
    case "M":
      return keys.toggleMute;
    case "f":
    case "F":
      return keys.fullscreen;
    default:
      return null;
  }
}
