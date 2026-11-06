import { Copy, Play } from "lucide-react";
import { useState } from "react";
import { formatClock, joinNames } from "../../lib/format.ts";
import { useRoom } from "../../sync/room.ts";
import { CodeLetters } from "../../ui/CodeLetters.tsx";
import { Button, Glass } from "../../ui/controls.tsx";
import { QrCode } from "../../ui/QrCode.tsx";
import { ScreenTopBar } from "../../ui/ScreenTopBar.tsx";
import { SalonPresence } from "./Presence.tsx";

function headline(otherNames: string[]): string {
  if (otherNames.length === 0) return "En attente des autres…";
  return `${joinNames(otherNames)} ${otherNames.length > 1 ? "sont là" : "est là"}`;
}

/** The salon: the code and its QR to share, who is here, and the button that starts the film for everyone. */
export function LobbyView({ code, onStart }: { code: string; onStart: () => void }) {
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
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <ScreenTopBar back="/" title={room?.media.title ?? "Séance"} />
      <main className="grid flex-1 items-center gap-[clamp(20px,4vw,48px)] py-6 md:grid-cols-2">
        <Glass className="grid justify-items-center gap-[18px] rounded-panel p-[26px] text-center">
          <p className="text-sm font-semibold text-fg-muted">Le code de la séance</p>
          <CodeLetters code={code} />
          <QrCode value={joinUrl} label={`QR code pour rejoindre la séance ${code}`} className="size-[132px]" />
          <Button size="regular" icon={<Copy />} onClick={copy}>
            {copied ? "Lien copié" : "Copier le lien"}
          </Button>
        </Glass>
        <div className="grid justify-items-center gap-[26px] text-center">
          <SalonPresence members={members} you={you} className="w-[min(380px,100%)]" />
          <h1
            className="font-rounded-tight text-[clamp(28px,3.6vw,40px)] leading-[1.05] font-extrabold text-fg"
            aria-live="polite"
          >
            {headline(others)}
          </h1>
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <span aria-hidden className={`size-2 rounded-full ${others.length ? "bg-success" : "bg-waiting"}`} />
            {resumeAt
              ? `On reprend à ${formatClock(resumeAt)}, là où vous vous étiez arrêtés`
              : others.length
                ? "Vous êtes connectés"
                : "Envoie le code à qui tu veux, jusqu'à 8 personnes"}
          </p>
          <Button variant="filled" size="large" icon={<Play />} onClick={onStart} disabled={!room}>
            {resumeAt ? "Reprendre le film" : "Lancer le film"}
          </Button>
        </div>
      </main>
    </div>
  );
}
