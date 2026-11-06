import type { Server as HttpServer } from "node:http";
import type { Http2SecureServer, Http2Server } from "node:http2";
import { parseClientMessage, type ServerMessage } from "@annamour/protocol";
import { type WebSocket, WebSocketServer } from "ws";
import type { Connection, RoomStore } from "./rooms.ts";

const HELLO_TIMEOUT_MS = 5_000;
const HEARTBEAT_MS = 25_000;
const MAX_MESSAGE_BYTES = 4 * 1024;

/** Attaches the sync WebSocket endpoint (/ws?room=ABCD) to the HTTP server. */
export function attachRealtime(
  server: HttpServer | Http2Server | Http2SecureServer,
  store: RoomStore,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => onConnection(ws, url.searchParams.get("room") ?? ""));
  });

  function onConnection(ws: WebSocket, code: string): void {
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

    ws.on("message", (data) => {
      const message = parseClientMessage(data.toString());
      if (!message) {
        connection.send({ type: "error", code: "bad_message", message: "Message illisible." });
        return;
      }
      if (memberId === null) {
        if (message.type !== "hello") return;
        clearTimeout(helloTimer);
        memberId = room.join(message.clientId, message.name, message.color, connection, Date.now());
        if (memberId === null) {
          connection.send({ type: "error", code: "room_full", message: "La séance est complète." });
          ws.close(4003, "room_full");
        }
        return;
      }
      room.handle(memberId, message, Date.now());
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (memberId !== null) room.leave(memberId, connection, Date.now());
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
