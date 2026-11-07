/*
 * Keeps the screen on while a film is open, paused included.
 *
 * A playing video keeps it on by itself; a paused one does not, and the
 * iPad's auto-lock then puts the page to sleep while someone is away for a
 * minute: the downloaded lead may be dropped and the connection lost, so the
 * film reloads when they come back. The system lets go of the lock whenever
 * the page is hidden; it is asked for again when it comes back.
 */

type WakeLockSentinelLike = { release: () => Promise<void> };

interface ScreenAwakeHost {
  request: () => Promise<WakeLockSentinelLike> | undefined;
  visible: () => boolean;
  onVisibility: (listener: () => void) => () => void;
}

const browserHost = (): ScreenAwakeHost => ({
  request: () => navigator.wakeLock?.request("screen"),
  visible: () => document.visibilityState === "visible",
  onVisibility: (listener) => {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
});

/** Holds the screen on until the returned function is called. Does nothing where unsupported. */
export function keepScreenAwake(host: ScreenAwakeHost = browserHost()): () => void {
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;
  const acquire = () => {
    if (stopped || !host.visible()) return;
    host
      .request()
      ?.then((held) => {
        if (stopped) void held.release().catch(() => {});
        else sentinel = held;
      })
      .catch(() => {
        // Refused (battery saver, no permission): the screen simply follows its usual settings.
      });
  };
  const offVisibility = host.onVisibility(acquire);
  acquire();
  return () => {
    stopped = true;
    offVisibility();
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
