/**
 * The colour of how far something went: the thread's while under way, mint
 * once watched to the end (the same mint as a watched episode's bar).
 */
export function progressFill(done: boolean): "bg-thread" | "bg-success" {
  return done ? "bg-success" : "bg-thread";
}
