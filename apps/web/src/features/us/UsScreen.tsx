import { byRecentUse } from "@annamour/protocol";
import { LogIn, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { Button } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
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
 * « Nous »: my circles, each tied by the red thread; then me, like a profile;
 * then my account; then what is set for this device only.
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
        <Circles me={account?.id ?? ""} onCreate={() => setCreating(true)} />
        {account ? <MeCard account={account} /> : null}
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
      <h2 id="circles-title" className="type-heading px-1">
        Mes cercles
      </h2>
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
      <ul className="grid gap-3">
        {byRecentUse(circles).map((circle) => (
          <CircleCard key={circle.id} circle={circle} me={me} />
        ))}
      </ul>
      <div className="mt-1 grid grid-cols-2 gap-3">
        <Button variant="filled" icon={<Plus />} onClick={onCreate}>
          Nouveau cercle
        </Button>
        <LinkButton href="/rejoindre" icon={<LogIn />}>
          J'ai un code
        </LinkButton>
      </div>
    </section>
  );
}
