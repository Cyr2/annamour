import {
  type BubbleColor,
  type CatalogRef,
  type ClientMessage,
  canGoToEpisode,
  canRemoveEpisode,
  type DeviceLead,
  declineNextEpisode,
  type EpisodeProgress,
  episodeAdded,
  episodeEnded,
  episodeRemoved,
  episodeResumed,
  episodeTitle,
  everyoneLeft,
  goToEpisode,
  initialPlayback,
  type Media,
  type Member,
  nextLead,
  type PlaybackAction,
  type PlaybackState,
  pause,
  play,
  positionAt,
  REACTION_COOLDOWN_MS,
  READY_MAX_WAIT_MS,
  type Readying,
  type RoomSnapshot,
  readyTarget,
  readyToStart,
  type ServerMessage,
  seek,
  startProgress,
} from "@annamour/protocol";
import type { ImportedMedia } from "./hls.ts";

export const MAX_MEMBERS = 8;

/** One video of the séance; `id` names its files and never changes. */
export interface Episode {
  id: number;
  label: string | undefined;
  imported: ImportedMedia;
  /** The catalog title it was made from; absent for a pasted link. */
  catalog?: CatalogRef | undefined;
}

/** What the room keeps on disk as it changes. */
export interface RoomPersistence {
  /** The position is worth keeping (pause, seek, join, last person leaving). */
  savePosition(position: number, now: number): void;
  /** Everyone moved to another episode, from its start. */
  saveCurrentEpisode(current: number, duration: number | undefined, now: number): void;
  removeEpisode(id: number): void;
}

const noPersistence: RoomPersistence = {
  savePosition: () => {},
  saveCurrentEpisode: () => {},
  removeEpisode: () => {},
};

export interface RoomOptions {
  /** Where a reopened session resumes, in seconds. */
  position?: number;
  /** The episode a reopened session is on. */
  current?: number;
  /** The id the next added episode gets (by default, past every episode given). */
  nextEpisodeId?: number;
  persistence?: RoomPersistence;
}

export interface Connection {
  send(message: ServerMessage): void;
  close(): void;
}

interface Participant extends Member {
  clientId: string;
  connection: Connection;
  lastReactionAt: number;
  /** What this device last said of its lead; undefined for an app that never reports it. */
  deviceLead?: DeviceLead | undefined;
}

/** Where an episode's files are served: by its id, so a link never points to another episode. */
function episodeMedia(code: string, title: string, episode: Episode): Media {
  const base = `/api/rooms/${code}/e/${episode.id}`;
  const { imported } = episode;
  return {
    title: episodeTitle(title, episode.label),
    src: `${base}/hls/master.m3u8`,
    audio: imported.audio,
    subtitles: imported.subtitles.map((s) => ({ ...s, url: `${base}/subs/${s.id}.vtt` })),
    ...(imported.duration ? { duration: imported.duration } : {}),
  };
}

export class Room {
  readonly code: string;
  readonly title: string;
  private readonly episodes: Episode[];
  private progress: EpisodeProgress;
  playback: PlaybackState;
  /** Set when playback was stopped because someone is buffering. */
  private resumeAfterBuffer = false;
  /** Set while the film waits for every device's lead before starting (see readying.ts). */
  private readying: Readying | null = null;
  private readonly participants = new Map<string, Participant>();
  private nextMemberId = 1;
  private readonly persistence: RoomPersistence;
  private episodeIds: number;
  emptySince: number | null;

  constructor(code: string, title: string, episodes: Episode[], now: number, options: RoomOptions = {}) {
    if (episodes.length === 0) throw new Error("A room needs at least one episode");
    this.code = code;
    this.title = title;
    this.episodes = episodes;
    const current = Math.min(options.current ?? 0, episodes.length - 1);
    this.progress = startProgress(current, episodes.length);
    // A reopened session always starts paused, where everyone left it.
    this.playback = { ...initialPlayback(now), position: options.position ?? 0 };
    this.persistence = options.persistence ?? noPersistence;
    this.episodeIds = options.nextEpisodeId ?? Math.max(...episodes.map((episode) => episode.id)) + 1;
    this.emptySince = now;
  }

  get size(): number {
    return this.participants.size;
  }

  get episodeCount(): number {
    return this.episodes.length;
  }

  /** The episode on screen. */
  /** The episode after the one on screen, if one is queued: what everyone watches next. */
  get nextEpisode(): Episode | undefined {
    return this.episodes[this.progress.current + 1];
  }

  get currentEpisode(): Episode {
    return this.episodeAtIndex(this.progress.current);
  }

  get media(): Media {
    return episodeMedia(this.code, this.title, this.currentEpisode);
  }

  /** The imported stream of the episode on screen. */
  get imported(): ImportedMedia {
    return this.currentEpisode.imported;
  }

  /** An episode by its id (the files of a queued episode are served before it plays). */
  episodeById(id: number): Episode | undefined {
    return this.episodes.find((episode) => episode.id === id);
  }

  /** The id the next added episode gets: ids only grow, a removed one is never given again. */
  get nextEpisodeId(): number {
    return this.episodeIds;
  }

  /** The label of the last episode in the queue, which the next one follows. */
  get lastEpisodeLabel(): string | undefined {
    return this.episodes.at(-1)?.label;
  }

  members(): Member[] {
    return [...this.participants.values()].map(({ id, name, color, buffering, deviceLead }) => ({
      id,
      name,
      color,
      buffering,
      // Leads only matter (and are only shown) while the room waits to start together.
      ...(this.readying && deviceLead ? { lead: Math.round(deviceLead.seconds) } : {}),
    }));
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      media: this.media,
      playback: this.playback,
      members: this.members(),
      episodes: this.episodes.map(({ label, imported, catalog }) => ({
        ...(label ? { label } : {}),
        ...(imported.duration ? { duration: imported.duration } : {}),
        ...(catalog ? { catalog } : {}),
      })),
      current: this.progress.current,
      finished: this.progress.finished,
      countdownUntil: this.progress.countdownUntil,
      ...(this.readying ? { readying: this.readying } : {}),
    };
  }

  /** Returns the member id, or null when the room is full. */
  join(clientId: string, name: string, color: BubbleColor, connection: Connection, now: number): string | null {
    let member = [...this.participants.values()].find((p) => p.clientId === clientId);
    if (member) {
      // Same device reconnecting: the new socket replaces the old one.
      member.connection.close();
      member.connection = connection;
      member.name = name;
      member.color = color;
      member.buffering = false;
    } else {
      if (this.participants.size >= MAX_MEMBERS) return null;
      const id = `m${this.nextMemberId++}`;
      member = { id, clientId, name, color, buffering: false, connection, lastReactionAt: -Infinity };
      this.participants.set(id, member);
    }
    this.emptySince = null;
    this.saveNow(now);
    connection.send({ type: "welcome", you: member.id, room: this.snapshot(), serverTime: now });
    this.broadcastMembers();
    this.maybeResume(now);
    this.maybeStart(now);
    return member.id;
  }

  /**
   * A member's link dropped; they may be back in a moment, so they stay listed.
   * Whatever they were loading no longer holds the room: it would wait for nobody.
   */
  disconnected(memberId: string, connection: Connection, now: number): void {
    const participant = this.participants.get(memberId);
    if (!participant || participant.connection !== connection || !participant.buffering) return;
    participant.buffering = false;
    this.broadcastMembers();
    this.maybeResume(now);
  }

  leave(memberId: string, connection: Connection, now: number): void {
    const participant = this.participants.get(memberId);
    if (!participant || participant.connection !== connection) return; // already replaced
    this.participants.delete(memberId);
    if (this.participants.size === 0) {
      this.emptySince = now;
      this.playback = pause(this.playback, now);
      this.resumeAfterBuffer = false;
      this.readying = null;
      this.saveNow(now);
      this.moveTo(everyoneLeft(this.progress), now, "paused");
      return;
    }
    this.broadcastMembers();
    this.maybeResume(now);
    // The one we were waiting for may have been the one who left.
    this.maybeStart(now);
  }

  /** Queues an episode after the others; everyone in the room sees it at once. Returns its index. */
  addEpisode(episode: Episode): number {
    this.episodes.push(episode);
    this.episodeIds = Math.max(this.episodeIds, episode.id + 1);
    this.progress = episodeAdded(this.progress);
    this.broadcastRoom();
    return this.episodes.length - 1;
  }

  handle(memberId: string, message: ClientMessage, now: number): void {
    const participant = this.participants.get(memberId);
    if (!participant) return;
    switch (message.type) {
      case "ping":
        participant.connection.send({ type: "pong", t0: message.t0, ts: now });
        this.maybeStart(now); // any message is a chance to notice the wait is over
        return;
      case "hello":
        return; // only valid as the first message, handled by the transport
      case "play":
      case "pause":
      case "seek":
        this.handlePlayback(memberId, message, now);
        return;
      case "buffering":
        this.onBuffering(participant, message.buffering, now, message.position);
        return;
      case "lead":
        this.onLead(participant, message.seconds, now);
        return;
      case "react":
        if (now - participant.lastReactionAt < REACTION_COOLDOWN_MS) return;
        participant.lastReactionAt = now;
        this.broadcast({ type: "reaction", by: memberId, emoji: message.emoji });
        return;
      default:
        this.handleEpisodeMessage(memberId, message, now);
    }
  }

  private handlePlayback(
    memberId: string,
    message: Extract<ClientMessage, { type: "play" | "pause" | "seek" }>,
    now: number,
  ): void {
    switch (message.type) {
      case "play":
        this.onPlay(memberId, message.position, now);
        return;
      case "pause":
        this.resumeAfterBuffer = false;
        this.setReadying(null);
        this.setPlayback(pause(this.playback, now, message.position), "pause", memberId);
        return;
      case "seek":
        // What was downloaded ahead was for the old position: everyone reports again.
        this.forgetLeads(now);
        if (this.readying) this.setReadying({ ...this.readying, until: now + READY_MAX_WAIT_MS });
        this.setPlayback(seek(this.playback, now, message.position), "seek", memberId);
        this.setProgress(episodeResumed(this.progress), memberId);
        return;
    }
  }

  positionAt(now: number): number {
    return positionAt(this.playback, now);
  }

  /** Persists where the video is right now. */
  saveNow(now: number): void {
    this.persistence.savePosition(this.positionAt(now), now);
  }

  closeAll(): void {
    for (const p of this.participants.values()) p.connection.close();
    this.participants.clear();
  }

  private handleEpisodeMessage(
    memberId: string,
    message: Extract<ClientMessage, { type: "ended" | "playEpisode" | "declineNext" | "removeEpisode" }>,
    now: number,
  ): void {
    switch (message.type) {
      case "ended":
        this.onEnded(message.episode, now);
        return;
      case "playEpisode":
        if (canGoToEpisode(this.progress, message.from, message.to))
          this.moveTo(goToEpisode(this.progress, message.to), now, "playing", memberId);
        return;
      case "declineNext":
        this.setProgress(declineNextEpisode(this.progress), memberId);
        return;
      case "removeEpisode":
        this.onRemoveEpisode(message.episode, memberId);
        return;
    }
  }

  private onPlay(memberId: string, position: number | undefined, now: number): void {
    if (this.anyoneBuffering()) {
      this.resumeAfterBuffer = true;
      this.setPlayback(pause(this.playback, now, position), "wait", memberId);
      return;
    }
    const from = position ?? this.positionAt(now);
    const readying = {
      target: readyTarget(from, this.currentEpisode.imported.duration),
      until: now + READY_MAX_WAIT_MS,
    };
    if (readyToStart(this.leads(), readying, now)) {
      this.setPlayback(play(this.playback, now, position), "play", memberId);
      return;
    }
    // Someone is still downloading their lead: wait for it, a little, rather than stall in a minute.
    this.setReadying(readying);
    this.setPlayback(pause(this.playback, now, position), "wait", memberId);
  }

  /** A paused device's lead; the wait may now be over. */
  private onLead(participant: Participant, seconds: number, now: number): void {
    participant.deviceLead = nextLead(participant.deviceLead, seconds, now);
    if (this.readying) this.broadcastMembers();
    this.maybeStart(now);
  }

  private leads(): Array<DeviceLead | undefined> {
    return [...this.participants.values()].map((p) => p.deviceLead);
  }

  /** The leads reported so far no longer apply (another position, another episode): back to zero. */
  private forgetLeads(now: number): void {
    for (const p of this.participants.values()) if (p.deviceLead) p.deviceLead = { seconds: 0, grewAt: now };
  }

  private setReadying(readying: Readying | null): void {
    if (readying === this.readying) return;
    this.readying = readying;
    this.broadcast({ type: "readying", readying });
    this.broadcastMembers();
  }

  /** The wait to start together is over (everyone ready, or long enough): the film starts. */
  private maybeStart(now: number): void {
    if (!this.readying || this.participants.size === 0 || this.anyoneBuffering()) return;
    if (!readyToStart(this.leads(), this.readying, now)) return;
    this.setReadying(null);
    this.setPlayback(play(this.playback, now), "resume");
  }

  private onBuffering(participant: Participant, buffering: boolean, now: number, position?: number): void {
    if (participant.buffering === buffering) return;
    participant.buffering = buffering;
    if (buffering && this.playback.status === "playing") {
      this.resumeAfterBuffer = true;
      // Wait where the stuck device is: the others step back a few seconds into what they
      // already have, rather than it jumping ahead into what it has not downloaded yet.
      const stuckAt = position === undefined ? undefined : Math.min(position, this.positionAt(now));
      this.setPlayback(pause(this.playback, now, stuckAt), "wait", participant.id);
    }
    this.broadcastMembers();
    this.maybeResume(now);
  }

  /** The end of an episode: everyone stops on its last image, and the countdown starts if another follows. */
  private onEnded(episode: number, now: number): void {
    const next = episodeEnded(this.progress, episode, now);
    if (next === this.progress) return;
    this.resumeAfterBuffer = false;
    this.readying = null;
    this.playback = pause(this.playback, now);
    this.saveNow(now);
    this.setProgress(next);
  }

  private onRemoveEpisode(index: number, memberId: string): void {
    if (!canRemoveEpisode(this.progress, index)) return;
    const [removed] = this.episodes.splice(index, 1);
    if (removed) this.persistence.removeEpisode(removed.id);
    this.setProgress(episodeRemoved(this.progress), memberId);
  }

  /** Another episode becomes the current one (or the same one stays): from its start, saved, shown to all. */
  private moveTo(next: EpisodeProgress, now: number, status: PlaybackState["status"], by?: string): void {
    const moved = next.current !== this.progress.current;
    this.progress = next;
    if (!moved) return;
    this.resumeAfterBuffer = false;
    const duration = this.currentEpisode.imported.duration;
    // A new episode starts together too: everyone first downloads a little of it (devices that report their lead).
    const together = status === "playing" && this.leads().some((lead) => lead !== undefined);
    if (together) this.forgetLeads(now);
    this.readying = together ? { target: readyTarget(0, duration), until: now + READY_MAX_WAIT_MS } : null;
    this.playback = { status: together ? "paused" : status, position: 0, at: now };
    this.persistence.saveCurrentEpisode(next.current, duration, now);
    this.broadcastRoom(by);
  }

  private setProgress(next: EpisodeProgress, by?: string): void {
    if (next === this.progress) return;
    this.progress = next;
    this.broadcastRoom(by);
  }

  private episodeAtIndex(index: number): Episode {
    const episode = this.episodes[index];
    if (!episode) throw new Error(`No episode at ${index}`);
    return episode;
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
    if (next.status === "paused" || action === "seek") this.persistence.savePosition(next.position, next.at);
    this.broadcast({ type: "playback", playback: next, action, ...(by ? { by } : {}) });
  }

  private broadcastMembers(): void {
    this.broadcast({ type: "members", members: this.members() });
  }

  private broadcastRoom(by?: string): void {
    if (this.participants.size === 0) return;
    this.broadcast({ type: "room", room: this.snapshot(), ...(by ? { by } : {}) });
  }

  private broadcast(message: ServerMessage): void {
    for (const p of this.participants.values()) p.connection.send(message);
  }
}
