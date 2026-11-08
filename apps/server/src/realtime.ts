import type { Server as HttpServer } from "node:http";
import type { Http2SecureServer, Http2Server } from "node:http2";
import { type ClientMessage, parseClientMessage, SESSION_COOKIE, type ServerMessage } from "@annamour/protocol";
import { parse as parseCookies } from "hono/utils/cookie";
import { type WebSocket, WebSocketServer } from "ws";
import type { Connection } from "./rooms.ts";
import type { Services } from "./services/services.ts";

const HELLO_TIMEOUT_MS = 5_000;
const HEARTBEAT_MS = 25_000;
const MAX_MESSAGE_BYTES = 4 * 1024;
/** How long a dropped member stays in the room before being counted as gone. */
export const RECONNECT_GRACE_MS = 30_000;
/**
 * Close codes that mean someone left: the app's own close (1000, "normal closure") and the
 * browser's when the page is closed or left (1001, "going away"). A dropped link closes
 * without either (1006), or with nothing at all.
 */
const LEFT_ON_PURPOSE = new Set([1000, 1001]);

/**
 * Attaches the sync WebSocket endpoint (/ws?room=ABCD) to the HTTP server.
 * Signed-in people (session cookie) get the session added to their history.
 */
export function attachRealtime(
  server: HttpServer | Http2Server | Http2SecureServer,
  { store, accounts, history }: Pick<Services, "store" | "accounts" | "history">,
  { reconnectGraceMs = RECONNECT_GRACE_MS }: { reconnectGraceMs?: number } = {},
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    const token = parseCookies(request.headers.cookie ?? "", SESSION_COOKIE)[SESSION_COOKIE];
    const accountId = accounts.accountFor(token)?.id;
    wss.handleUpgrade(request, socket, head, (ws) => onConnection(ws, url.searchParams.get("room") ?? "", accountId));
  });

  function onConnection(ws: WebSocket, code: string, accountId: string | undefined): void {
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));

    const connection: Connection = {
      send(message: ServerMessage) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
      },
      close() {
        ws.close(4000, "replaced");
      },
    };

    const room = store.get(code.toUpperCase());
    if (!room) {
      connection.send({ type: "error", code: "room_not_found", message: "Cette séance n'existe plus." });
      ws.close(4004, "room_not_found");
      return;
    }

    let memberId: string | null = null;
    const helloTimer = setTimeout(() => ws.close(4001, "hello_timeout"), HELLO_TIMEOUT_MS);

    const welcome = (hello: Extract<ClientMessage, { type: "hello" }>): string | null => {
      clearTimeout(helloTimer);
      const id = room.join(hello.clientId, hello.name, hello.color, connection, Date.now(), accountId);
      if (id === null) {
        connection.send({ type: "error", code: "room_full", message: "La séance est complète." });
        ws.close(4003, "room_full");
      } else if (accountId !== undefined) {
        history.recordParticipation(room.code, accountId);
      }
      return id;
    };

    ws.on("message", (data) => {
      const message = parseClientMessage(data.toString());
      if (!message) {
        connection.send({ type: "error", code: "bad_message", message: "Message illisible." });
      } else if (memberId !== null) {
        room.handle(memberId, message, Date.now());
      } else if (message.type === "hello") {
        memberId = welcome(message);
      }
    });

    ws.on("close", (code) => {
      clearTimeout(helloTimer);
      if (memberId === null) return;
      const id = memberId;
      // Leaving the séance closes cleanly (1000, 1001): gone at once. A dropped link (a phone's 4G
      // blinking, a locked screen) gets a moment to come back before « X est parti(e) » is said;
      // meanwhile the room never waits for them.
      if (LEFT_ON_PURPOSE.has(code)) {
        room.leave(id, connection, Date.now());
        return;
      }
      room.disconnected(id, connection, Date.now());
      setTimeout(() => room.leave(id, connection, Date.now()), reconnectGraceMs).unref();
    });
  }

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}
