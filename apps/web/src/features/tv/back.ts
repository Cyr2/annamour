/*
 * The remote's Retour key, screen by screen: the innermost open thing closes
 * first (a bar, a menu), then the screen goes back. Handlers stack up as
 * they mount; the last one mounted is asked first.
 */

/** Returns true when it handled Retour, false to let the next one (or the screen's default) act. */
export type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

/** Registers a handler on top of the stack; returns its removal. */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
  };
}

/** Asks the handlers, innermost first, until one handles Retour. */
export function runBackHandlers(): boolean {
  for (let index = handlers.length - 1; index >= 0; index--) {
    if (handlers[index]?.()) return true;
  }
  return false;
}

/** The screens where Retour leaves the app: the TV's home and its pairing screen. */
const ROOT_PATHS = new Set(["/", "/tv/lier"]);

/** Where Retour leads from `path` when no handler took it: home, or nowhere (null) from a root. */
export function backTarget(path: string): string | null {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return ROOT_PATHS.has(clean) ? null : "/";
}
