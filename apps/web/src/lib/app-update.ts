import { registerSW } from "virtual:pwa-register";
import { canReloadNow } from "./reload-policy.ts";

/*
 * Keeping the installed app up to date without reinstalling it: it looks for
 * a new version when it starts, whenever it comes back to the foreground and
 * every half hour, and reloads onto it by itself, except during a séance,
 * where it waits until the film is left (a reload would cut it).
 */

const CHECK_EVERY_MS = 30 * 60 * 1000;
const RETRY_EVERY_MS = 5000;

export function startAppUpdates(): void {
  let pending = false;
  let retry: ReturnType<typeof setInterval> | undefined;

  const applyWhenFree = () => {
    if (!pending || !canReloadNow(window.location.pathname)) return;
    clearInterval(retry);
    void update(true);
  };

  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true;
      applyWhenFree();
      // In a séance: try again until it is left (the app navigates without page loads).
      retry ??= setInterval(applyWhenFree, RETRY_EVERY_MS);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => {});
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
}
