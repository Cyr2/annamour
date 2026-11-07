import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { extname, join, normalize } from "node:path";
import { CERT_FILE, KEY_FILE, MEDIA_DIR } from "./media.ts";

/*
 * The fake CDN of the weak-network test: serves the prepared film over https,
 * with CORS like Naka's video host (the browser fetches segments cross-origin).
 */

const PORT = Number(process.env.CDN_PORT ?? 8791);
const TYPES: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".aac": "audio/aac",
};

const server = createServer({ cert: readFileSync(CERT_FILE), key: readFileSync(KEY_FILE) }, (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "https://cdn").pathname)).replace(/^[/\\]+/, "");
  // timing-allow-origin: the test reads how fast each segment really came, through the throttled link.
  const headers = { "access-control-allow-origin": "*", "timing-allow-origin": "*", "cache-control": "no-store" };
  if (path.startsWith("..") || path === "health") {
    res.writeHead(path === "health" ? 200 : 404, headers).end();
    return;
  }
  try {
    const body = readFileSync(join(MEDIA_DIR, path));
    res.writeHead(200, { ...headers, "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404, headers).end();
  }
});

server.listen(PORT, () => console.info(`Fake CDN on https://localhost:${PORT}`));
