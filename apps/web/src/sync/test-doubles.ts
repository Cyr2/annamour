import type { ClientMessage } from "@annamour/protocol";
import type { SyncClient } from "./SyncClient.ts";

/* Test doubles for the sync engine: a <video> we can drive, and a client that records. */

const HAVE_ENOUGH_DATA = 4;

/** Enough of HTMLVideoElement for PlayerSync, with knobs to simulate playback. */
export class FakeVideo extends EventTarget {
  paused = true;
  currentTime = 0;
  duration = 7826;
  readyState = HAVE_ENOUGH_DATA;
  playbackRate = 1;
  seeking = false;
  ended = false;
  playsInline = false;
  preload = "";
  src = "";
  volume = 1;
  muted = false;
  /** Set to make the next play() fail like an autoplay refusal. */
  refusePlay = false;
  readonly calls: string[] = [];
  private attributes = new Map<string, string>();

  canPlayType(): string {
    return "maybe";
  }

  getAttribute(name: string): string | null {
    if (name === "src") return this.src || null;
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
    this.attributes.delete(name);
  }

  load(): void {
    this.calls.push("load");
  }

  play(): Promise<void> {
    this.calls.push("play");
    if (this.refusePlay) return Promise.reject(new DOMException("autoplay", "NotAllowedError"));
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }

  pause(): void {
    this.calls.push("pause");
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }

  /** A seek made by the person, e.g. through native controls. */
  userSeek(to: number): void {
    this.currentTime = to;
    this.dispatchEvent(new Event("seeked"));
  }

  fire(type: string): void {
    this.dispatchEvent(new Event(type));
  }

  asElement(): HTMLVideoElement {
    return this as unknown as HTMLVideoElement;
  }
}

/** A SyncClient stand-in: records what is sent, with a controllable clock and connection. */
export class FakeClient {
  sent: ClientMessage[] = [];
  online = true;
  now = 0;
  private statusListeners = new Set<(status: "open") => void>();

  send(message: ClientMessage): boolean {
    if (!this.online) return false;
    this.sent.push(message);
    return true;
  }

  serverNow(): number {
    return this.now;
  }

  onStatus(listener: (status: "open") => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  reopen(): void {
    for (const listener of this.statusListeners) listener("open");
  }

  of<T extends ClientMessage["type"]>(type: T): Extract<ClientMessage, { type: T }>[] {
    return this.sent.filter((m): m is Extract<ClientMessage, { type: T }> => m.type === type);
  }

  asClient(): SyncClient {
    return this as unknown as SyncClient;
  }
}
