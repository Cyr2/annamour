export interface PlayerKeys {
  toggle: () => void;
  seekBy: (delta: number) => void;
  toggleMute: () => void;
  fullscreen: () => void;
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
