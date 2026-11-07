import type { SyncClient } from "./SyncClient.ts";

/*
 * « Revoir »: a séance watched to the end opens with `?depuis=debut`, and
 * the room is rewound to the start for everyone as soon as this device is in.
 */

export const FROM_START_PARAM = "depuis";
export const FROM_START_VALUE = "debut";

/** The link that reopens a séance; `fromStart` rewinds it (see restartOnWelcome). */
export function sessionPath(code: string, fromStart = false): string {
  return fromStart ? `/s/${code}?${FROM_START_PARAM}=${FROM_START_VALUE}` : `/s/${code}`;
}

/** Whether the salon was opened to watch again from the beginning (`search` as in location.search). */
export function wantsFromStart(search: string): boolean {
  return new URLSearchParams(search).get(FROM_START_PARAM) === FROM_START_VALUE;
}

/**
 * Waits for the room's welcome, then seeks it to 0 through the usual seek
 * message, once. A room someone is already watching is left alone: they
 * started it again before us. `done` runs after the welcome either way.
 * Returns a function that stops waiting.
 */
export function restartOnWelcome(client: Pick<SyncClient, "on" | "send">, done?: () => void): () => void {
  let waiting = true;
  const stop = client.on((message) => {
    if (!waiting || message.type !== "welcome") return;
    waiting = false;
    stop();
    const { playback } = message.room;
    if (playback.status !== "playing" && playback.position > 0) client.send({ type: "seek", position: 0 });
    done?.();
  });
  return () => {
    waiting = false;
    stop();
  };
}
