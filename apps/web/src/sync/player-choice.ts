import { z } from "zod/mini";
import { readStored, writeStored } from "../lib/storage.ts";

/*
 * Which player an Apple device uses, chosen per device.
 *
 * Safari's own player keeps a short, undocumented lead: when a phone's 4G
 * weakens longer than that, the video stops and the whole séance waits. Our
 * player (hls.js, which iPads and recent iPhones can run) downloads up to ten
 * minutes ahead and lowers the quality before running dry. It is tried on one
 * device by opening the app once with `?lecteur=annamour`, and undone with
 * `?lecteur=safari`; the séance's stats compare the two.
 */

export type PlayerChoice = "safari" | "annamour";

const STORAGE_KEY = "annamour:player:v1";
const Choice = z.enum(["safari", "annamour"]);

/** Remembers the choice given in the address (`?lecteur=…`), if any. */
export function rememberPlayerChoice(search: string): void {
  const asked = Choice.safeParse(new URLSearchParams(search).get("lecteur"));
  if (asked.success) writeStored(STORAGE_KEY, asked.data);
}

/** This device's player on Apple hardware: Safari's own unless our player was chosen. */
export function playerChoice(): PlayerChoice {
  return readStored(STORAGE_KEY, Choice) ?? "safari";
}

export function setPlayerChoice(choice: PlayerChoice): void {
  writeStored(STORAGE_KEY, choice);
}

/**
 * An iPhone or iPad that can run our player (Media Source): only there is
 * there a choice to make. iPadOS presents itself as a Mac, touch tells them apart.
 */
export function offersPlayerChoice(nav: Navigator = navigator, win: typeof globalThis = globalThis): boolean {
  const apple = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
  return apple && ("ManagedMediaSource" in win || "MediaSource" in win);
}
