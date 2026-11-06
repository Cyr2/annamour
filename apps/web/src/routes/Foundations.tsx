import { BUBBLE_COLORS, isRoomCode } from "@annamour/protocol";
import { LogIn, Pause, Play, Plus } from "lucide-react";
import { useId, useState } from "react";
import { CodeInput } from "../ui/CodeInput.tsx";
import { BUBBLE_COLOR_LABELS, bubbleColor } from "../ui/colors.ts";
import { Button, Switch } from "../ui/controls.tsx";
import { PresenceBubble } from "../ui/PresenceBubble.tsx";
import { RedThread } from "../ui/RedThread.tsx";
import { toast } from "../ui/toast.ts";
import { Wordmark } from "../ui/Wordmark.tsx";

/* Temporary page: shows the foundations working together. */

const PALETTE = [
  { name: "Nuit", hex: "#12101A", swatch: "bg-palette-night", role: "Le fond" },
  { name: "Encre", hex: "#1D1828", swatch: "bg-palette-ink", role: "Les surfaces" },
  { name: "Lait", hex: "#F6F2FA", swatch: "bg-palette-milk", role: "Le texte" },
  { name: "Fil rouge", hex: "#FF8C9E", swatch: "bg-palette-thread", role: "Le lien, l'action" },
  { name: "Lilas", hex: "#A99CFF", swatch: "bg-palette-lilac", role: "Le second accent" },
  { name: "Menthe", hex: "#7FE3C1", swatch: "bg-palette-mint", role: "En phase" },
] as const;

export function Foundations() {
  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1080px] flex-col">
      <header className="flex h-14 items-center">
        <Wordmark />
      </header>

      <main className="flex flex-1 flex-col">
        <Hero />
        <div className="mt-20 grid gap-x-16 gap-y-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <StartPanel />
          <Palette />
        </div>
      </main>

      <footer className="mt-24 pb-2 text-xs text-fg-subtle">Page de fondations, temporaire.</footer>
    </div>
  );
}

/* ---------- Hero: the thread between two people ---------- */

function Hero() {
  const [synced, setSynced] = useState(true);
  const [annaPulse, setAnnaPulse] = useState(0);
  const [dariusPulse, setDariusPulse] = useState(0);
  const switchId = useId();

  const toggleSynced = (next: boolean) => {
    setSynced(next);
    if (next) setDariusPulse((n) => n + 1);
  };

  const simulatePause = () => {
    setAnnaPulse((n) => n + 1);
    toast({ message: "Anna a mis en pause", icon: <Pause />, color: "peach" });
  };

  return (
    <section aria-labelledby="hero-title" className="relative flex flex-col items-center pt-10 text-center md:pt-16">
      {/* A low warm light behind the stage, like a screen glowing in the dark. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[420px] w-[min(900px,120vw)] -translate-x-1/2"
        style={{ background: "radial-gradient(50% 50% at 50% 45%, var(--am-accent-soft), transparent 70%)" }}
      />

      <RedThread.Root synced={synced} className="w-full max-w-[620px]">
        <RedThread.Line />
        <div className="flex items-start justify-between px-2 sm:px-8">
          <Person name="Anna" color="peach" pulse={annaPulse} end="start" status="here">
            {synced ? "En phase" : "Attend Darius"}
          </Person>
          <Person name="Darius" color="sky" pulse={dariusPulse} end="end" status={synced ? "here" : "waiting"}>
            {synced ? "En phase" : "Charge la vidéo…"}
          </Person>
        </div>
      </RedThread.Root>

      <h1 id="hero-title" className="mt-14 font-rounded-tight text-display leading-[1.02] font-extrabold text-fg">
        Une soirée ensemble
      </h1>
      <p className="mt-4 max-w-[42ch] text-md text-fg-muted">Le même film, à la même seconde, chacun chez soi.</p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <label
          htmlFor={switchId}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-pill bg-surface py-1.5 pr-2.5 pl-5 text-sm font-semibold text-fg"
        >
          Fil tendu
          <Switch id={switchId} checked={synced} onCheckedChange={toggleSynced} />
        </label>
        <Button icon={<Pause />} onClick={simulatePause}>
          Simuler une pause
        </Button>
      </div>
    </section>
  );
}

interface PersonProps {
  name: string;
  color: (typeof BUBBLE_COLORS)[number];
  status: "here" | "waiting";
  pulse: number;
  end: "start" | "end";
  children: string;
}

function Person({ name, color, status, pulse, end, children }: PersonProps) {
  return (
    <div className="flex w-28 flex-col items-center gap-2.5">
      <RedThread.Anchor end={end}>
        <PresenceBubble name={name} color={color} status={status} pulse={pulse} size="lg" />
      </RedThread.Anchor>
      <PresenceBubble.Caption>{name}</PresenceBubble.Caption>
      <PresenceBubble.Status>{children}</PresenceBubble.Status>
    </div>
  );
}

/* ---------- Start: create or join ---------- */

function StartPanel() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const join = (value = code) => {
    if (!isRoomCode(value)) {
      setError("Le code fait 4 lettres.");
      return;
    }
    toast({ message: `Connexion à la séance ${value}`, icon: <LogIn /> });
  };

  return (
    <section aria-labelledby="start-title" className="rounded-sheet bg-surface p-6 sm:p-9">
      <h2 id="start-title" className="text-xl font-extrabold text-fg">
        Commencer
      </h2>
      <p className="mt-2 max-w-[42ch] text-sm text-fg-muted">
        Créez une séance avec un lien vidéo, puis envoyez le code à l'autre personne.
      </p>

      <Button
        variant="filled"
        size="large"
        icon={<Plus />}
        className="mt-7"
        onClick={() => toast({ message: "Séance créée", icon: <Play /> })}
      >
        Créer une séance
      </Button>

      <div className="mt-10 border-t border-line pt-8">
        <CodeInput
          label="Vous avez reçu un code ?"
          value={code}
          onValueChange={(next) => {
            setCode(next);
            setError(null);
          }}
          onComplete={join}
          error={error}
        />
        <Button size="large" icon={<LogIn />} className="mt-2" onClick={() => join()}>
          Rejoindre
        </Button>
      </div>
    </section>
  );
}

/* ---------- Palette ---------- */

function Palette() {
  return (
    <section aria-labelledby="palette-title" className="lg:pt-9">
      <h2 id="palette-title" className="text-xl font-extrabold text-fg">
        Nuit douce
      </h2>
      <p className="mt-2 max-w-[40ch] text-sm text-fg-muted">
        Une palette de salle obscure, avec un seul rouge : celui du fil.
      </p>

      <ul className="mt-7 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {PALETTE.map((c) => (
          <li key={c.name} className="flex items-center gap-3.5">
            <span aria-hidden className={`size-11 shrink-0 rounded-full border border-line-strong ${c.swatch}`} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-fg">
                {c.name} <span className="font-normal text-fg-subtle tabular-nums">{c.hex}</span>
              </span>
              <span className="block truncate text-xs text-fg-muted">{c.role}</span>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-12 text-lg font-bold text-fg">Couleurs des bulles</h3>
      <ul className="mt-5 grid w-fit grid-cols-6 gap-x-4 gap-y-4 max-[400px]:grid-cols-3">
        {BUBBLE_COLORS.map((color) => (
          <li key={color} className="flex flex-col items-center gap-1.5">
            <span
              aria-hidden
              className="size-11 rounded-full shadow-bubble"
              style={{ backgroundColor: bubbleColor(color) }}
            />
            <span className="text-xs text-fg-muted">{BUBBLE_COLOR_LABELS[color]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
