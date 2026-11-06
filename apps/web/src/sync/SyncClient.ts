import {
  type ClientMessage,
  ClockEstimator,
  parseServerMessage,
  type ServerMessage,
  sampleFrom,
} from "@annamour/protocol";
import type { Identity } from "./identity.ts";

/*
 * One WebSocket to a room. Reconnects with exponential backoff, says hello on
 * every (re)connection, and keeps an NTP-style estimate of the server clock so
 * every device can compute the same "now".
 */

export type ConnectionStatus =
  | "idle" // not started
  | "connecting" // first attempt
  | "open" // welcomed by the server
  | "reconnecting" // lost, retrying
  | "failed" // gave up for good (room not found)
  | "closed"; // closed by us

export interface SyncClientOptions {
  room: string;
  /** Read at each (re)connection, so a renamed person reconnects with the new name. */
  identity: () => Identity;
  /** Defaults to same-origin /ws?room=CODE. */
  url?: (room: string) => string;
}

type MessageListener = (message: ServerMessage) => void;
type StatusListener = (status: ConnectionStatus) => void;

const FAST_PING_MS = 2_000;
const FAST_PING_SAMPLES = 5;
const SLOW_PING_MS = 10_000;
/** No message at all for this long means the socket is dead even if not closed (common on iOS). */
const STALE_MS = 25_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 15_000;

/** Monotonic, epoch-based local clock: immune to wall-clock jumps during a session. */
export function localNow(): number {
  return performance.timeOrigin + performance.now();
}

function defaultUrl(room: string): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws?room=${encodeURIComponent(room)}`;
}

export class SyncClient {
  readonly room: string;
  private readonly identity: () => Identity;
  private readonly url: (room: string) => string;

  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "idle";
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setTimeout> | undefined;
  private samplesThisConnection = 0;
  private lastMessageAt = 0;
  private stopped = true;

  private readonly clock = new ClockEstimator();
  /** Rough offset from the welcome's serverTime, used until real samples arrive. */
  private roughOffset: number | null = null;

  private readonly messageListeners = new Set<MessageListener>();
  private readonly statusListeners = new Set<StatusListener>();

  constructor(options: SyncClientOptions) {
    this.room = options.room;
    this.identity = options.identity;
    this.url = options.url ?? defaultUrl;
  }

  /* ---------- lifecycle ---------- */

  connect(): void {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener("online", this.handleWake);
    document.addEventListener("visibilitychange", this.handleWake);
    this.open();
  }

  close(): void {
    this.stopped = true;
    window.removeEventListener("online", this.handleWake);
    document.removeEventListener("visibilitychange", this.handleWake);
    clearTimeout(this.retryTimer);
    clearTimeout(this.pingTimer);
    this.dropSocket();
    this.setStatus("closed");
  }

  /* ---------- public API ---------- */

  /** Sends if connected. Returns false when the message could not be sent. */
  send(message: ClientMessage): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }

  on(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  /** Server time minus local time, ms. */
  get clockOffset(): number {
    if (this.clock.size > 0) return this.clock.offset;
    return this.roughOffset ?? 0;
  }

  /** True once enough round trips were measured to trust the clock. */
  get clockReady(): boolean {
    return this.clock.ready;
  }

  get rtt(): number {
    return this.clock.rtt;
  }

  /** The current server time, ms. */
  serverNow(): number {
    return localNow() + this.clockOffset;
  }

  /* ---------- socket ---------- */

  private open(): void {
    if (this.stopped) return;
    this.dropSocket();
    const firstTime = this.status !== "open" && this.status !== "reconnecting";
    this.setStatus(firstTime ? "connecting" : "reconnecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url(this.room));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.samplesThisConnection = 0;

    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.lastMessageAt = localNow();
      const { clientId, name, color } = this.identity();
      this.send({ type: "hello", clientId, name, color });
      this.ping();
    };

    ws.onmessage = (event) => {
      if (ws !== this.ws || typeof event.data !== "string") return;
      this.lastMessageAt = localNow();
      const message = parseServerMessage(event.data);
      if (!message) return;
      this.handle(message);
    };

    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.ws = null;
      clearTimeout(this.pingTimer);
      if (!this.stopped && this.status !== "failed") this.scheduleReconnect();
    };

    // An error is always followed by close; reconnection happens there.
    ws.onerror = () => {};
  }

  private dropSocket(): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try {
      ws.close();
    } catch {
      // already closing
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    clearTimeout(this.retryTimer);
    this.setStatus("reconnecting");
    const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempt);
    const delay = exp / 2 + Math.random() * (exp / 2); // "equal jitter"
    this.attempt++;
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  /** Back online or back in the foreground: check the socket, retry right away if needed. */
  private handleWake = (): void => {
    if (this.stopped || document.visibilityState === "hidden") return;
    const ws = this.ws;
    const stale = localNow() - this.lastMessageAt > STALE_MS;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING || stale) {
      clearTimeout(this.retryTimer);
      this.attempt = 0;
      this.open();
    } else if (ws.readyState === WebSocket.OPEN) {
      this.ping();
    }
  };

  /* ---------- messages ---------- */

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case "welcome":
        this.attempt = 0;
        // One-way delay makes this a little early; real samples replace it.
        this.roughOffset = message.serverTime - localNow();
        this.setStatus("open");
        break;
      case "pong":
        this.clock.add(sampleFrom(message.t0, message.ts, localNow()));
        this.samplesThisConnection++;
        break;
      case "error":
        if (message.code === "room_not_found" || message.code === "room_full") {
          this.stopped = true;
          clearTimeout(this.pingTimer);
          this.dropSocket();
          this.setStatus("failed");
        }
        break;
      default:
        break;
    }
    for (const listener of this.messageListeners) listener(message);
  }

  private ping(): void {
    clearTimeout(this.pingTimer);
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (localNow() - this.lastMessageAt > STALE_MS) {
      // Silent socket: force a reconnect instead of waiting for TCP to notice.
      this.dropSocket();
      this.scheduleReconnect();
      return;
    }
    this.send({ type: "ping", t0: localNow() });
    const interval = this.samplesThisConnection < FAST_PING_SAMPLES ? FAST_PING_MS : SLOW_PING_MS;
    this.pingTimer = setTimeout(() => this.ping(), interval);
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
