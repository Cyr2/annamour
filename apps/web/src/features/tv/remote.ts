/*
 * The TV remote as the page sees it. The Android TV app turns the D-pad into
 * arrow keys, OK into Enter, play/pause into Space and Retour into Escape;
 * a TV browser may send the media and GoBack keys themselves.
 */

export type Direction = "up" | "down" | "left" | "right";
export type RemoteKey = Direction | "ok" | "back" | "playPause";

const KEYS: Record<string, RemoteKey> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "ok",
  Escape: "back",
  GoBack: "back",
  BrowserBack: "back",
  " ": "playPause",
  MediaPlayPause: "playPause",
  MediaPlay: "playPause",
  MediaPause: "playPause",
};

/** What a key means on the remote; `editing` is true while a text field has the focus (Backspace erases there). */
export function remoteKey(key: string, editing = false): RemoteKey | null {
  if (key === "Backspace") return editing ? null : "back";
  return KEYS[key] ?? null;
}

export function isDirection(key: RemoteKey | null): key is Direction {
  return key === "up" || key === "down" || key === "left" || key === "right";
}

/** True for a field where the arrows and Backspace belong to the text. */
export function isEditable(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly;
  if (element instanceof HTMLInputElement) {
    return !element.readOnly && !["button", "checkbox", "radio", "range", "submit", "reset"].includes(element.type);
  }
  return element instanceof HTMLElement && element.isContentEditable;
}
