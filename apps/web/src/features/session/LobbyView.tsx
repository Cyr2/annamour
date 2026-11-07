import { Copy, Play } from "lucide-react";
import { useState } from "react";
import { formatClock, joinNames } from "../../lib/format.ts";
import { useRoom } from "../../sync/room.ts";
import { CodeLetters } from "../../ui/CodeLetters.tsx";
import { Button } from "../../ui/controls.tsx";
import { QrCode } from "../../ui/QrCode.tsx";
import { ScreenTopBar } from "../../ui/ScreenTopBar.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { useTv } from "../tv/tv-context.ts";
import { SalonPresence } from "./Presence.tsx";

function headline(otherNames: string[]): string {
  if (otherNames.length === 0) return "En attente des autres…";
  return `${joinNames(otherNames)} ${otherNames.length > 1 ? "sont là" : "est là"}`;
}

function statusLine(resumeAt: number | null, othersCount: number): string {
  if (resumeAt) return `On reprend à ${formatClock(resumeAt)}, là où vous vous étiez arrêtés`;
  return othersCount ? "Vous êtes connectés" : "Envoie le code à qui tu veux, jusqu'à 8 personnes";
}

/** The salon: the code and its QR to share, who is here, and the button that starts the film for everyone. */
export function LobbyView({ code, onStart }: { code: string; onStart: () => void }) {
  const tv = useTv();
  const room = useRoom((s) => s.room);
  const members = useRoom((s) => s.members);
  const you = useRoom((s) => s.you);
  const playback = useRoom((s) => s.playback);
  const [copied, setCopied] = useState(false);
  const joinUrl = `${window.location.origin}/s/${code}`;
  const others = members.filter((m) => m.id !== you).map((m) => m.name);
  const resumeAt = playback && playback.position > 1 ? playback.position : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1100px] flex-col">
      <ScreenTopBar back="/" title={room?.media.title ?? "Séance"} />
      <main className="grid flex-1 content-center items-center gap-8 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-12">
        <div className="grid justify-items-center gap-6 text-center md:order-2">
          <SalonPresence members={members} you={you} className="w-[min(22.5rem,100%)]" />
          <div className="grid justify-items-center gap-3">
            <h1 className="type-title" aria-live="polite">
              {headline(others)}
            </h1>
            {/* The dot flows with the words, so it stays by the first one when the line wraps. */}
            <p className="max-w-[40ch] text-sm text-pretty text-fg-muted">
              <span
                aria-hidden
                className={`mr-2 inline-block size-2 rounded-full align-middle ${others.length ? "bg-success" : "bg-waiting"}`}
              />
              {statusLine(resumeAt, others.length)}
            </p>
          </div>
          {/* The salon starts here on a TV: OK launches the film for everyone. */}
          <div data-tv-primary>
            <Button variant="filled" size="large" icon={<Play />} onClick={onStart} disabled={!room}>
              {resumeAt ? "Reprendre le film" : "Lancer le film"}
            </Button>
          </div>
        </div>
        <Surface className="surface-panel grid justify-items-center gap-5 p-6 text-center sm:p-8 md:order-1">
          <p className="type-label">Le code de la séance</p>
          <CodeLetters code={code} />
          <div className="flex items-center gap-4 text-left">
            <QrCode
              value={joinUrl}
              label={`QR code pour rejoindre la séance ${code}`}
              className="size-[6.5rem] shrink-0"
            />
            {/* A TV has no clipboard to share from: phones scan the code instead. */}
            {tv ? (
              <p className="max-w-[18ch] text-sm text-fg-muted">Ou scanne ce code avec ton téléphone.</p>
            ) : (
              <div className="grid justify-items-start gap-2.5">
                <p className="max-w-[18ch] text-sm text-fg-muted">Ou scanne ce code, ou envoie le lien.</p>
                <Button icon={<Copy />} tone="accent" onClick={copy}>
                  {copied ? "Lien copié" : "Copier le lien"}
                </Button>
              </div>
            )}
          </div>
        </Surface>
      </main>
    </div>
  );
}
