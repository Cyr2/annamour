import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/*
 * A film shaped like Naka's, served by a fake CDN for the weak-network test:
 * one 720p H.264 variant in 10 s MPEG-TS segments (~2 Mb/s of noisy picture,
 * so it does not compress to nothing), and its audio as a separate rendition
 * of audio-only MPEG-TS segments named `.aac`. Made once with ffmpeg, then
 * reused; with a self-signed certificate, since séances only accept https.
 */

export const MEDIA_DIR = join(import.meta.dirname, "..", ".cache", "weak-network");
export const CERT_FILE = join(MEDIA_DIR, "cert.pem");
export const KEY_FILE = join(MEDIA_DIR, "key.pem");
/** About 3 min 30 s: a 30 s noisy clip, looped (encoding the noise once keeps the setup quick). */
const CLIP_SECONDS = 30;
const LOOPS = 7;

const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Français",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="fr",URI="audio_fr/index.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio"
720p/index.m3u8
`;

const run = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

export function ffmpegInstalled(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hls(input: string[], codec: string[], folder: string, extension: string) {
  mkdirSync(join(MEDIA_DIR, folder), { recursive: true });
  run([
    ...input,
    ...codec,
    ...["-f", "hls", "-hls_time", "10", "-hls_playlist_type", "vod", "-hls_segment_type", "mpegts"],
    ...["-hls_segment_filename", join(MEDIA_DIR, folder, `segment-%03d.${extension}`)],
    join(MEDIA_DIR, folder, "index.m3u8"),
  ]);
}

function makeFilm() {
  const clip = join(MEDIA_DIR, "clip.mp4");
  run([
    ...["-f", "lavfi", "-i", `testsrc2=size=1280x720:rate=24,noise=alls=10:allf=t,format=yuv420p`],
    ...["-t", String(CLIP_SECONDS), "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high"],
    ...[
      "-b:v",
      "2000k",
      "-maxrate",
      "2600k",
      "-bufsize",
      "5000k",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-sc_threshold",
      "0",
    ],
    clip,
  ]);
  hls(["-stream_loop", String(LOOPS - 1), "-i", clip], ["-c:v", "copy", "-an"], "720p", "ts");
  const seconds = String(CLIP_SECONDS * LOOPS);
  hls(
    ["-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${seconds}`],
    ["-ac", "2", "-c:a", "aac", "-b:a", "128k"],
    "audio_fr",
    "aac",
  );
  rmSync(clip);
}

function makeCertificate() {
  execFileSync("openssl", [
    ...["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "3"],
    ...["-keyout", KEY_FILE, "-out", CERT_FILE, "-subj", "/CN=localhost"],
    ...["-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"],
  ]);
}

/** Makes the film and certificate if they are not there yet (the config runs in several processes). */
export function prepareWeakNetworkMedia(): void {
  if (existsSync(join(MEDIA_DIR, "master.m3u8"))) return;
  rmSync(MEDIA_DIR, { recursive: true, force: true });
  mkdirSync(MEDIA_DIR, { recursive: true });
  makeCertificate();
  makeFilm();
  writeFileSync(join(MEDIA_DIR, "master.m3u8"), MASTER);
}
