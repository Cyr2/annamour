import { registerSW } from "virtual:pwa-register";
import { requestsInFlight } from "../api/http.ts";
import { detectTvMode } from "../features/tv/tv-mode.ts";
import { toast } from "../ui/toast.ts";
import { isCalm } from "./reload-policy.ts";

/*
 * Keeping the installed app up to date without reinstalling it: it looks for a
 * new version when it starts, whenever it comes back to the foreground (an
 * installed app stays in memory for days without reloading its page) and
 * every half hour. A new version is offered, « Nouvelle version prête ·
 * Recharger », at a calm moment, never in the middle of something; it is
 * never loaded without asking.
 */

const CHECK_EVERY_MS = 30 * 60 * 1000;
/** How often a waiting offer looks for a calm moment. */
const CALM_CHECK_MS = 2000;

const calmNow = () =>
  isCalm({
    path: window.location.pathname,
    sheetOpen: document.querySelector('[role="dialog"][aria-modal="true"]') !== null,
    requests: requestsInFlight(),
  });

export function startAppUpdates(): void {
  let waiting: ReturnType<typeof setInterval> | undefined;
  const onTv = detectTvMode();

  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (waiting) return;
      const offerWhenCalm = () => {
        if (!calmNow()) return;
        clearInterval(waiting);
        // A TV's remote cannot reach a button in a capsule: there the new version loads by itself, when calm.
        if (onTv) return void update(true);
        toast({
          message: "Nouvelle version prête",
          action: { label: "Recharger", onClick: () => void update(true) },
          duration: Number.POSITIVE_INFINITY,
        });
      };
      waiting = setInterval(offerWhenCalm, CALM_CHECK_MS);
      offerWhenCalm();
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
