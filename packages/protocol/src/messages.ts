/*
 * Schemas use zod's tree-shakeable "mini" API: the same checks as classic
 * zod, but the PWA only downloads the validators it actually uses (classic
 * zod alone was ~28 kB gzip of the first visit). The server reads them too.
 */
import { z } from "zod/mini";
import { CatalogRef } from "./catalog.ts";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./room-code.ts";

/** The colours a person can pick for their bubble. Values live in the web tokens. */
export const BUBBLE_COLORS = ["peach", "lilac", "mint", "sky", "butter", "rose"] as const;
export const BubbleColor = z.enum(BUBBLE_COLORS);
export type BubbleColor = z.infer<typeof BubbleColor>;

export const RoomCode = z.string().check(
  z.length(ROOM_CODE_LENGTH),
  z.refine((s) => [...s].every((c) => ROOM_CODE_ALPHABET.includes(c)), "invalid room code"),
);

export const Position = z.number().check(z.gte(0), z.lte(60 * 60 * 24));

export const PlaybackStateSchema = z.object({
  status: z.enum(["playing", "paused"]),
  position: Position,
  at: z.number(),
});

export const Member = z.object({
  id: z.string(),
  name: z.string(),
  color: BubbleColor,
  buffering: z.boolean(),
});
export type Member = z.infer<typeof Member>;

export const AudioTrack = z.object({ id: z.string(), label: z.string(), language: z.optional(z.string()) });
export type AudioTrack = z.infer<typeof AudioTrack>;

export const SubtitleTrack = z.object({
  id: z.string(),
  label: z.string(),
  language: z.optional(z.string()),
  url: z.string(),
  forced: z.boolean(),
});
export type SubtitleTrack = z.infer<typeof SubtitleTrack>;

export const Media = z.object({
  title: z.string(),
  /** Same-origin playlist served by the Annamour server. */
  src: z.string(),
  audio: z.array(AudioTrack),
  subtitles: z.array(SubtitleTrack),
  duration: z.optional(z.number()),
});
export type Media = z.infer<typeof Media>;

/** One video of a séance (see episodes.ts). The first one usually has no label: it is the séance itself. */
export const EpisodeLabel = z.string().check(z.trim(), z.minLength(1), z.maxLength(40));
export const EpisodeInfo = z.object({
  label: z.optional(z.string()),
  duration: z.optional(z.number()),
  /** The catalog title it was made from, when it was not a pasted link: lets the PWA offer what follows. */
  catalog: z.optional(CatalogRef),
});
export type EpisodeInfo = z.infer<typeof EpisodeInfo>;
export const EpisodeIndex = z.number().check(z.int(), z.gte(0));

export const RoomSnapshot = z.object({
  code: RoomCode,
  /** The episode on screen; its title names the episode too (« The Bear · S2 · É5 »). */
  media: Media,
  playback: PlaybackStateSchema,
  members: z.array(Member),
  episodes: z.array(EpisodeInfo),
  current: EpisodeIndex,
  /** The current episode was watched to its end. */
  finished: z.boolean(),
  /** Server time at which the next episode starts for everyone; null when no countdown runs. */
  countdownUntil: z.nullable(z.number()),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshot>;

export const Name = z.string().check(z.trim(), z.minLength(1), z.maxLength(24));

/** A short set, light on top of a film, from tender to teasing: love, then shyness and mischief, then shock, then laughing at the film. */
export const REACTIONS = ["❤️", "🥰", "😻", "🥺", "🤭", "😏", "😱", "🫪", "💀", "🤡"] as const;
export const Reaction = z.enum(REACTIONS);
export type Reaction = z.infer<typeof Reaction>;
/** Minimum delay between two reactions from the same person, in ms. */
export const REACTION_COOLDOWN_MS = 300;

/* ---------- client → server ---------- */

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    clientId: z.string().check(z.minLength(8), z.maxLength(64)),
    name: Name,
    color: BubbleColor,
  }),
  z.object({ type: z.literal("ping"), t0: z.number() }),
  z.object({ type: z.literal("play"), position: z.optional(Position) }),
  z.object({ type: z.literal("pause"), position: z.optional(Position) }),
  z.object({ type: z.literal("seek"), position: Position }),
  /** `position`: where this device is stuck, so the room waits there instead of sending it ahead into nothing. */
  z.object({ type: z.literal("buffering"), buffering: z.boolean(), position: z.optional(Position) }),
  z.object({ type: z.literal("react"), emoji: Reaction }),
  /** This device reached the end of `episode`. */
  z.object({ type: z.literal("ended"), episode: EpisodeIndex }),
  /** Move everyone from episode `from` to episode `to` (once, however many devices ask). */
  z.object({ type: z.literal("playEpisode"), from: EpisodeIndex, to: EpisodeIndex }),
  /** « Pas ce soir »: stop the countdown for everyone. */
  z.object({ type: z.literal("declineNext") }),
  z.object({ type: z.literal("removeEpisode"), episode: EpisodeIndex }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/* ---------- server → client ---------- */

export const PlaybackAction = z.enum(["play", "pause", "seek", "wait", "resume"]);
export type PlaybackAction = z.infer<typeof PlaybackAction>;

export const ErrorCode = z.enum(["room_not_found", "bad_message", "room_full"]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("welcome"), you: z.string(), room: RoomSnapshot, serverTime: z.number() }),
  z.object({ type: z.literal("pong"), t0: z.number(), ts: z.number() }),
  z.object({
    type: z.literal("playback"),
    playback: PlaybackStateSchema,
    action: PlaybackAction,
    /** Who caused it; absent when the server did (e.g. resume after buffering). */
    by: z.optional(z.string()),
  }),
  z.object({ type: z.literal("members"), members: z.array(Member) }),
  /** The episodes changed (one added or removed, the countdown, the next one started): the whole room again. */
  z.object({ type: z.literal("room"), room: RoomSnapshot, by: z.optional(z.string()) }),
  /** Shown to everyone in the room, the sender included. */
  z.object({ type: z.literal("reaction"), by: z.string(), emoji: Reaction }),
  z.object({ type: z.literal("error"), code: ErrorCode, message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/* ---------- HTTP ---------- */

export const CreateRoomRequest = z.object({
  url: z.url({ protocol: /^https$/ }),
  title: z.optional(z.string().check(z.trim(), z.minLength(1), z.maxLength(120))),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequest>;

export const CreateRoomResponse = z.object({ code: RoomCode });
export type CreateRoomResponse = z.infer<typeof CreateRoomResponse>;

/** Queues the next episode of a séance: imported like a new séance, then shown to everyone in it. */
export const AddEpisodeRequest = z.object({
  url: z.url({ protocol: /^https$/ }),
  label: z.optional(EpisodeLabel),
});
export type AddEpisodeRequest = z.infer<typeof AddEpisodeRequest>;
export const AddEpisodeResponse = z.object({ episode: EpisodeIndex });
export type AddEpisodeResponse = z.infer<typeof AddEpisodeResponse>;

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const result = ClientMessage.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const result = ServerMessage.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
