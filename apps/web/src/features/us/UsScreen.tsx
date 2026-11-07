import { byRecentUse } from "@annamour/protocol";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { useAccount } from "../account/account.ts";
import { loadCircles, useCircles } from "../circles/circles.ts";
import { AccountCard } from "../profile/AccountCard.tsx";
import { MeCard } from "../profile/MeCard.tsx";
import { PlayerChoiceCard } from "../profile/PlayerChoiceCard.tsx";
import { InterfaceChoiceCard } from "../ui-version/InterfaceChoiceCard.tsx";
import { CircleCard } from "./CircleCard.tsx";
import { NameCircleSheet } from "./NameCircleSheet.tsx";

/**
 * « Nous »: me first, like a profile; then my circles side by side, a new one
 * at the end; then my account; then what is set for this device only.
 */
export function UsScreen() {
  useEffect(() => void loadCircles(), []);
  const account = useAccount((s) => s.account);
  const [creating, setCreating] = useState(false);

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <BrandBar />
      <main className="mx-auto grid w-full max-w-[760px] content-start gap-7 py-6">
        <h1 className="sr-only">Nous</h1>
        {account ? <MeCard account={account} /> : null}
        <Circles me={account?.id ?? ""} onCreate={() => setCreating(true)} />
        <AccountCard />
        <section className="grid gap-3" aria-labelledby="device-title">
          <h2 id="device-title" className="px-1 text-xs font-bold tracking-[0.06em] text-fg-muted uppercase">
            Réglages de cet appareil
          </h2>
          <InterfaceChoiceCard />
          <PlayerChoiceCard />
        </section>
      </main>
      <NameCircleSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function Circles({ me, onCreate }: { me: string; onCreate: () => void }) {
  const circles = useCircles((s) => s.circles);
  const status = useCircles((s) => s.status);

  return (
    <section className="grid gap-2" aria-labelledby="circles-title">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="circles-title" className="type-heading">
          Mes cercles
        </h2>
        <Link href="/rejoindre" className="flex min-h-11 items-center text-sm font-semibold text-accent">
          J'ai un code
        </Link>
      </div>
      {status === "loading" || status === "idle" ? (
        <div className="grid place-items-center py-6">
          <ThreadSpinner />
        </div>
      ) : null}
      {status === "ready" && circles.length === 0 ? (
        <p className="px-1 text-sm text-fg-muted">
          Un cercle se forme tout seul quand tu regardes une séance avec quelqu'un. Tu peux aussi en créer un et y
          inviter qui tu veux.
        </p>
      ) : null}
      <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        {byRecentUse(circles).map((circle) => (
          <CircleCard key={circle.id} circle={circle} me={me} />
        ))}
        <li className="w-32 shrink-0">
          <button
            type="button"
            onClick={onCreate}
            className="grid h-full min-h-44 w-full cursor-pointer place-items-center content-center gap-2 rounded-panel border border-dashed border-line-strong text-sm font-semibold text-fg"
          >
            <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
              <Plus aria-hidden className="size-5" />
            </span>
            Nouveau cercle
          </button>
        </li>
      </ul>
    </section>
  );
}
