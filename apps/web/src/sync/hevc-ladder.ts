import { offersPlayerChoice, playerChoice } from "./player-choice.ts";

/*
 * The complete HEVC ladder (234p to 720p), for our hls.js player on an iPad.
 *
 * HEVC needs ~15–25 % fewer bits than H.264 for the same picture. hls.js
 * starts on the most efficient codec family it can decode, then never leaves
 * it: a browser shown both would be stuck in whichever it started on. So the
 * server only lists HEVC to a player that asks for it, and then lists nothing
 * else (see the server's hevcLadderMaster). Only our player on an iPad asks:
 * Chrome, Firefox and the Android TV app keep H.264, which they all decode.
 */

/** The hardest rung hls.js will append: HEVC Main at level 3.1 (720p), in plain Media Source. */
export const HEVC_MSE_TYPE = 'video/mp4; codecs="hvc1.1.6.L93.B0"';

/** This browser's Media Source (the plain one, as hls-config.ts uses on an iPad) takes HEVC. */
export function decodesHevc(win: typeof globalThis = globalThis): boolean {
  const mediaSource: unknown = Reflect.get(win, "MediaSource");
  if (typeof mediaSource !== "function") return false;
  const isTypeSupported: unknown = Reflect.get(mediaSource, "isTypeSupported");
  return typeof isTypeSupported === "function" && isTypeSupported.call(mediaSource, HEVC_MSE_TYPE) === true;
}

/** An iPad that chose our player and decodes HEVC in Media Source: it asks for the complete HEVC ladder. */
export function wantsHevcLadder(nav: Navigator = navigator, win: typeof globalThis = globalThis): boolean {
  return offersPlayerChoice(nav, win) && playerChoice() === "annamour" && decodesHevc(win);
}
