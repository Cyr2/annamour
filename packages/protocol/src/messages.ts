import { z } from "zod";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./room-code.ts";

/** The colours a person can pick for their bubble. Values live in the web tokens. */
export const BUBBLE_COLORS = ["peach", "lilac", "mint", "sky", "butter", "rose"] as const;
export const BubbleColor = z.enum(BUBBLE_COLORS);
export type BubbleColor = z.infer<typeof BubbleColor>;

export const RoomCode = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .refine((s) => [...s].every((c) => ROOM_CODE_ALPHABET.includes(c)), "invalid room code");

export const Position = z.number().min(0).max(60 * 60 * 24);

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

export const AudioTrack = z.object({ id: z.string(), label: z.string(), language: z.string().optional() });
export type AudioTrack = z.infer<typeof AudioTrack>;

export const SubtitleTrack = z.object({
  id: z.string(),
  label: z.string(),
  language: z.string().optional(),
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
  duration: z.number().optional(),
});
export type Media = z.infer<typeof Media>;

export const RoomSnapshot = z.object({
  code: RoomCode,
  media: Media,
  playback: PlaybackStateSchema,
  members: z.array(Member),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshot>;

export const Name = z.string().trim().min(1).max(24);

/* ---------- client → server ---------- */

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), clientId: z.string().min(8).max(64), name: Name, color: BubbleColor }),
  z.object({ type: z.literal("ping"), t0: z.number() }),
  z.object({ type: z.literal("play"), position: Position.optional() }),
  z.object({ type: z.literal("pause"), position: Position.optional() }),
  z.object({ type: z.literal("seek"), position: Position }),
  z.object({ type: z.literal("buffering"), buffering: z.boolean() }),
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
    by: z.string().optional(),
  }),
  z.object({ type: z.literal("members"), members: z.array(Member) }),
  z.object({ type: z.literal("error"), code: ErrorCode, message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/* ---------- HTTP ---------- */

export const CreateRoomRequest = z.object({
  url: z.url({ protocol: /^https$/ }),
  title: z.string().trim().min(1).max(120).optional(),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequest>;

export const CreateRoomResponse = z.object({ code: RoomCode });
export type CreateRoomResponse = z.infer<typeof CreateRoomResponse>;

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
