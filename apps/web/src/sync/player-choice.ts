import { z } from "zod/mini";
import { readStored, writeStored } from "../lib/storage.ts";

/*
 * Which player an Apple device uses, chosen per device.
 *
 * Safari's own player keeps a short, undocumented lead: when the 4G weakens
 * longer than that, the video stops and the whole séance waits. On an iPad our
 * player (hls.js on Media Source) downloads about five minutes ahead (WebKit's
 * memory cap, see hls-config.ts) and lowers the quality before running dry.
 * It is chosen in the profile, or with `?lecteur=annamour` (`?lecteur=safari`
 * to undo); the séance's stats compare the two.
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
 * An iPad: only there is our player worth choosing. It needs the full Media
 * Source, which iPads have; iPhones only have the managed kind, whose lead
 * WebKit keeps at 10–30 s, no better than Safari's own player. iPadOS
 * presents itself as a Mac: touch tells them apart.
 */
export function offersPlayerChoice(nav: Navigator = navigator, win: typeof globalThis = globalThis): boolean {
  const iPad = /iPad/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
  return iPad && "MediaSource" in win;
}
