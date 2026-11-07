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
import { CircleCard } from "./CircleCard.tsx";
import { NameCircleSheet } from "./NameCircleSheet.tsx";

/** « Nous »: the circles I watch with, how to grow them, then me and my account. */
export function UsScreen() {
  useEffect(() => void loadCircles(), []);
  const account = useAccount((s) => s.account);
  const circles = useCircles((s) => s.circles);
  const status = useCircles((s) => s.status);
  const [creating, setCreating] = useState(false);
  const me = account?.id ?? "";

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <BrandBar />
      <main className="mx-auto grid w-full max-w-[760px] content-start gap-6 py-6">
        <h1 className="sr-only">Nous</h1>
        <section className="grid gap-3" aria-labelledby="circles-title">
          <h2 id="circles-title" className="type-heading">
            Mes cercles
          </h2>
          {status === "loading" || status === "idle" ? (
            <div className="grid place-items-center py-6">
              <ThreadSpinner />
            </div>
          ) : null}
          {status === "ready" && circles.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Un cercle se forme tout seul quand tu regardes une séance avec quelqu'un. Tu peux aussi en créer un et y
              inviter qui tu veux.
            </p>
          ) : null}
          <ul className="grid gap-3">
            {circles.map((circle) => (
              <CircleCard key={circle.id} circle={circle} me={me} />
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button icon={<Plus />} onClick={() => setCreating(true)}>
              Créer un cercle
            </Button>
            <LinkButton href="/rejoindre" icon={<LogIn />}>
              Rejoindre avec un code
            </LinkButton>
          </div>
        </section>
        {account ? (
          <section className="grid gap-3" aria-labelledby="me-title">
            <h2 id="me-title" className="type-heading">
              Moi
            </h2>
            <MeCard account={account} />
          </section>
        ) : null}
        <AccountCard />
      </main>
      <NameCircleSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
