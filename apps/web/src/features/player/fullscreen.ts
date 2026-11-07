/*
 * Full screen for the player. Where the page can go full screen (Android,
 * desktop, iPad), the whole player does, so our controls stay, and a phone
 * turns to landscape. iPhone only knows full screen on the video itself,
 * which iOS turns sideways on its own.
 */

export type FullscreenPlan = "exit" | "element" | "video" | "none";

interface FullscreenAbilities {
  /** Something is full screen already. */
  active: boolean;
  /** The page may go full screen (`document.fullscreenEnabled`). */
  pageAllowed: boolean;
  /** The video has iOS's own full screen (`webkitEnterFullscreen`). */
  videoAllowed: boolean;
}

export function fullscreenPlan({ active, pageAllowed, videoAllowed }: FullscreenAbilities): FullscreenPlan {
  if (active) return "exit";
  if (pageAllowed) return "element";
  return videoAllowed ? "video" : "none";
}

type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
/** `lock` is missing from TypeScript's DOM types and from most desktop browsers. */
type LockableOrientation = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };

function orientation(): LockableOrientation | undefined {
  return typeof screen === "undefined" ? undefined : (screen.orientation as LockableOrientation | undefined);
}

let watchingExit = false;

/** Leaving full screen (button, Escape, back gesture) frees the rotation again. */
function unlockOnExit(): void {
  if (watchingExit) return;
  watchingExit = true;
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) orientation()?.unlock?.();
  });
}

async function enterPage(): Promise<void> {
  await document.documentElement.requestFullscreen();
  unlockOnExit();
  // Only phones and tablets can lock; a desktop browser refuses, which is fine.
  await orientation()
    ?.lock?.("landscape")
    .catch(() => {});
}

export function toggleFullscreen(video: HTMLVideoElement | null): void {
  const webkitVideo = video as WebkitVideo | null;
  const plan = fullscreenPlan({
    active: Boolean(document.fullscreenElement),
    pageAllowed: Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen),
    videoAllowed: typeof webkitVideo?.webkitEnterFullscreen === "function",
  });
  if (plan === "exit") void document.exitFullscreen().catch(() => {});
  else if (plan === "element") void enterPage().catch(() => {});
  else if (plan === "video") webkitVideo?.webkitEnterFullscreen?.();
}
