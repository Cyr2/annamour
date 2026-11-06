import {
  generateRoomCode,
  initialPlayback,
  pause,
  play,
  positionAt,
  REACTION_COOLDOWN_MS,
  seek,
  type BubbleColor,
  type ClientMessage,
  type Media,
  type Member,
  type PlaybackAction,
  type PlaybackState,
  type RoomSnapshot,
  type ServerMessage,
} from "@annamour/protocol";
import type { ImportedMedia } from "./hls.ts";

export const MAX_MEMBERS = 8;
/** An empty room is kept this long, so a dropped connection can come back. */
export const EMPTY_ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export interface Connection {
  send(message: ServerMessage): void;
  close(): void;
}

interface Participant extends Member {
  clientId: string;
  connection: Connection;
  lastReactionAt: number;
}

export class Room {
  readonly code: string;
  readonly media: Media;
  readonly imported: ImportedMedia;
  playback: PlaybackState;
  /** Set when playback was stopped because someone is buffering. */
  private resumeAfterBuffer = false;
  private readonly participants = new Map<string, Participant>();
  private nextMemberId = 1;
  emptySince: number | null;

  constructor(code: string, title: string, imported: ImportedMedia, now: number) {
    this.code = code;
    this.imported = imported;
    this.playback = initialPlayback(now);
    this.emptySince = now;
    const base = `/api/rooms/${code}`;
    this.media = {
      title,
      src: `${base}/hls/master.m3u8`,
      audio: imported.audio,
      subtitles: imported.subtitles.map((s) => ({ ...s, url: `${base}/subs/${s.id}.vtt` })),
      ...(imported.duration ? { duration: imported.duration } : {}),
    };
  }

  get size(): number {
    return this.participants.size;
  }

  members(): Member[] {
    return [...this.participants.values()].map(({ id, name, color, buffering }) => ({ id, name, color, buffering }));
  }

  snapshot(): RoomSnapshot {
    return { code: this.code, media: this.media, playback: this.playback, members: this.members() };
  }

  /** Returns the member id, or null when the room is full. */
  join(clientId: string, name: string, color: BubbleColor, connection: Connection, now: number): string | null {
    const existing = [...this.participants.values()].find((p) => p.clientId === clientId);
    if (existing) {
      // Same device reconnecting: the new socket replaces the old one.
      existing.connection.close();
      existing.connection = connection;
      existing.name = name;
      existing.color = color;
      existing.buffering = false;
    } else {
      if (this.participants.size >= MAX_MEMBERS) return null;
      const id = `m${this.nextMemberId++}`;
      this.participants.set(id, { id, clientId, name, color, buffering: false, connection, lastReactionAt: -Infinity });
    }
    const member = existing ?? [...this.participants.values()].at(-1)!;
    this.emptySince = null;
    connection.send({ type: "welcome", you: member.id, room: this.snapshot(), serverTime: now });
    this.broadcastMembers();
    this.maybeResume(now);
    return member.id;
  }

  leave(memberId: string, connection: Connection, now: number): void {
    const participant = this.participants.get(memberId);
    if (!participant || participant.connection !== connection) return; // already replaced
    this.participants.delete(memberId);
    if (this.participants.size === 0) {
      this.emptySince = now;
      this.playback = pause(this.playback, now);
      this.resumeAfterBuffer = false;
      return;
    }
    this.broadcastMembers();
    this.maybeResume(now);
  }

  handle(memberId: string, message: ClientMessage, now: number): void {
    const participant = this.participants.get(memberId);
    if (!participant) return;
    switch (message.type) {
      case "ping":
        participant.connection.send({ type: "pong", t0: message.t0, ts: now });
        return;
      case "hello":
        return; // only valid as the first message, handled by the transport
      case "play":
        if (this.anyoneBuffering()) {
          this.resumeAfterBuffer = true;
          this.setPlayback(pause(this.playback, now, message.position), "wait", memberId);
        } else {
          this.setPlayback(play(this.playback, now, message.position), "play", memberId);
        }
        return;
      case "pause":
        this.resumeAfterBuffer = false;
        this.setPlayback(pause(this.playback, now, message.position), "pause", memberId);
        return;
      case "seek":
        this.setPlayback(seek(this.playback, now, message.position), "seek", memberId);
        return;
      case "buffering":
        if (participant.buffering === message.buffering) return;
        participant.buffering = message.buffering;
        if (message.buffering && this.playback.status === "playing") {
          this.resumeAfterBuffer = true;
          this.setPlayback(pause(this.playback, now), "wait", memberId);
        }
        this.broadcastMembers();
        this.maybeResume(now);
        return;
      case "react":
        if (now - participant.lastReactionAt < REACTION_COOLDOWN_MS) return;
        participant.lastReactionAt = now;
        this.broadcast({ type: "reaction", by: memberId, emoji: message.emoji });
        return;
    }
  }

  positionAt(now: number): number {
    return positionAt(this.playback, now);
  }

  closeAll(): void {
    for (const p of this.participants.values()) p.connection.close();
    this.participants.clear();
  }

  private anyoneBuffering(): boolean {
    return [...this.participants.values()].some((p) => p.buffering);
  }

  private maybeResume(now: number): void {
    if (!this.resumeAfterBuffer || this.anyoneBuffering() || this.participants.size === 0) return;
    this.resumeAfterBuffer = false;
    this.setPlayback(play(this.playback, now), "resume");
  }

  private setPlayback(next: PlaybackState, action: PlaybackAction, by?: string): void {
    this.playback = next;
    this.broadcast({ type: "playback", playback: next, action, ...(by ? { by } : {}) });
  }

  private broadcastMembers(): void {
    this.broadcast({ type: "members", members: this.members() });
  }

  private broadcast(message: ServerMessage): void {
    for (const p of this.participants.values()) p.connection.send(message);
  }
}

export class RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  create(title: string, imported: ImportedMedia, now: number): Room {
    let code = generateRoomCode(this.random);
    for (let tries = 0; this.rooms.has(code); tries++) {
      if (tries > 50) throw new Error("No free room code");
      code = generateRoomCode(this.random);
    }
    const room = new Room(code, title, imported, now);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Drops rooms that have been empty for longer than the TTL. */
  sweep(now: number, ttl = EMPTY_ROOM_TTL_MS): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (room.emptySince !== null && now - room.emptySince > ttl) {
        room.closeAll();
        this.rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }
}
