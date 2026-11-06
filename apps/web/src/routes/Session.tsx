import { isRoomCode, normalizeRoomCode } from "@annamour/protocol";
import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useRoom, useRoomConnection } from "../sync/room.ts";
import type { ConnectionStatus } from "../sync/SyncClient.ts";
import { usePlayerSync } from "../sync/usePlayerSync.ts";
import { Button } from "../ui/controls.tsx";
import { PresenceBubble } from "../ui/PresenceBubble.tsx";
import { Wordmark } from "../ui/Wordmark.tsx";

/* Placeholder for the watch screen: wires the sync layer end to end. */

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: "Préparation",
  connecting: "Connexion…",
  open: "Connecté",
  reconnecting: "Reconnexion…",
  failed: "Séance introuvable",
  closed: "Déconnecté",
};

export function Session({ code: raw }: { code: string }) {
  const code = normalizeRoomCode(raw);
  const valid = isRoomCode(code);
  const client = useRoomConnection(valid ? code : null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const player = usePlayerSync(video, client);

  const status = useRoom((s) => s.status);
  const members = useRoom((s) => s.members);
  const title = useRoom((s) => s.room?.media.title);
  const subtitles = useRoom((s) => s.room?.media.subtitles);
  const playing = useRoom((s) => s.playback?.status === "playing");

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1080px] flex-col gap-6">
      <header className="flex h-14 items-center justify-between">
        <Link href="/" className="rounded-control">
          <Wordmark />
        </Link>
        <span className="text-sm text-fg-muted">
          {valid ? `Séance ${code}, ${STATUS_LABEL[status].toLocaleLowerCase("fr")}` : "Code invalide"}
        </span>
      </header>

      <h1 className="text-xl font-extrabold">{title ?? "Séance"}</h1>

      <div className="relative overflow-hidden rounded-panel bg-surface">
        {/* biome-ignore lint/a11y/useMediaCaption: subtitle <track>s come from the room's media at runtime (mapped below), which static analysis cannot see; a placeholder track would be an empty caption file. */}
        <video ref={setVideo} className="aspect-video w-full" playsInline controls>
          {subtitles?.map((track) => (
            <track
              key={track.id}
              kind="subtitles"
              src={track.url}
              srcLang={track.language}
              label={track.label}
              // Forced French subtitles only translate foreign lines: show them by default.
              default={track.forced && track.language === "fr"}
            />
          ))}
        </video>
        {player.blocked ? (
          <div className="absolute inset-0 grid place-items-center">
            <Button variant="filled" size="large" icon={<Play />} onClick={player.controls.unlock}>
              Lancer la lecture
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="filled"
          icon={playing ? <Pause /> : <Play />}
          onClick={() => (playing ? player.controls.pause() : player.controls.play())}
        >
          {playing ? "Pause" : "Lecture"}
        </Button>
        {player.error ? <p className="text-sm text-danger">{player.error}</p> : null}
      </div>

      <ul className="flex gap-6">
        {members.map((m) => (
          <li key={m.id}>
            <PresenceBubble name={m.name} color={m.color} status={m.buffering ? "waiting" : "here"}>
              <PresenceBubble.Caption>{m.name}</PresenceBubble.Caption>
            </PresenceBubble>
          </li>
        ))}
      </ul>
    </div>
  );
}
