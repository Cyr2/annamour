import type { Circle } from "@annamour/protocol";
import { ChevronRight, Clapperboard, Plus } from "lucide-react";
import { Reorder } from "motion/react-m";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { offersPlayerChoice } from "../../sync/player-choice.ts";
import { BrandFooter } from "../../ui/BrandFooter.tsx";
import { Button } from "../../ui/controls.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { LayoutMotion } from "../../ui/LayoutMotion.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { toast } from "../../ui/toast.ts";
import { WaitingThread } from "../../ui/WaitingThread.tsx";
import { useAccount } from "../account/account.ts";
import { moveId } from "../circles/circle-rules.ts";
import { loadCircles, previewCircleOrder, reorderCircles, useCircles } from "../circles/circles.ts";
import { AccountCard } from "../profile/AccountCard.tsx";
import { MeCard } from "../profile/MeCard.tsx";
import { PlayerChoiceCard } from "../profile/PlayerChoiceCard.tsx";
import { useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";
import { CircleCard } from "./CircleCard.tsx";
import { NameCircleSheet } from "./NameCircleSheet.tsx";

/**
 * « Nous »: my circles, each tied by the red thread; then me, like a profile,
 * and my account, side by side once there is room; then what is set for this
 * device only, when this device has anything to set.
 */
export function UsScreen() {
  useEffect(() => void loadCircles(), []);
  const account = useAccount((s) => s.account);
  const [creating, setCreating] = useState(false);

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <main className="mx-auto grid w-full max-w-[760px] content-start gap-7 py-6">
        <h1 className="sr-only">Nous</h1>
        <Circles me={account?.id ?? ""} onCreate={() => setCreating(true)} />
        <div className="grid items-start gap-7 lg:grid-cols-2 lg:gap-5">
          {account ? <MeCard account={account} /> : null}
          <AccountCard />
        </div>
        {offersPlayerChoice() ? (
          <section className="grid gap-3" aria-labelledby="device-title">
            <h2 id="device-title" className="px-1 text-xs font-bold tracking-[0.06em] text-fg-muted uppercase">
              Réglages de cet appareil
            </h2>
            <PlayerChoiceCard />
          </section>
        ) : null}
      </main>
      <BrandFooter />
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
        {/* Joining a circle goes through its invitation link; « J'ai un code » is for a séance, on « Ce soir ». */}
        <IconButton label="Nouveau cercle" icon={<Plus />} variant="glass" onClick={onCreate} />
      </div>
      {status === "loading" || status === "idle" ? (
        <div className="grid place-items-center py-6">
          <ThreadSpinner />
        </div>
      ) : null}
      {status === "ready" && circles.length === 0 ? <NoCircleYet onCreate={onCreate} /> : null}
      <CircleList circles={circles} me={me} />
      <AllSeancesLink />
    </section>
  );
}

/** No circle yet: the thread waits for the people of a first one, and creating it is one tap away. */
function NoCircleYet({ onCreate }: { onCreate: () => void }) {
  const account = useAccount((s) => s.account);
  return (
    <Surface className="surface-panel p-5">
      <WaitingThread
        me={{ name: account?.name ?? "Toi", color: account?.color ?? "peach" }}
        title="Pas encore de cercle"
        action={
          <Button variant="filled" icon={<Plus />} onClick={onCreate}>
            Créer un cercle
          </Button>
        }
      >
        Un cercle se forme tout seul dès une séance à plusieurs. Tu peux aussi en créer un et y inviter qui tu veux.
      </WaitingThread>
    </Surface>
  );
}

/** Drag a circle by its handle: the new order shows at once everywhere, and is saved when the drag ends. */
function CircleList({ circles, me }: { circles: Circle[]; me: string }) {
  const save = (ids: string[]) =>
    void reorderCircles(ids).catch((failure: Error) => toast({ message: failure.message }));
  const ids = circles.map((circle) => circle.id);

  return (
    <LayoutMotion>
      <Reorder.Group as="ul" axis="y" values={circles} onReorder={previewCircleOrder} className="grid gap-3">
        {circles.map((circle, index) => (
          <CircleCard
            key={circle.id}
            circle={circle}
            me={me}
            canMoveUp={index > 0}
            canMoveDown={index < circles.length - 1}
            onMove={(delta) => save(moveId(ids, circle.id, delta))}
            onDrop={() => save(useCircles.getState().circles.map((c) => c.id))}
          />
        ))}
      </Reorder.Group>
    </LayoutMotion>
  );
}

/** Every séance, whatever the circle: under way, then over. */
function AllSeancesLink() {
  useLoadSessions();
  const count = useSessions((s) => s.sessions.length);
  return (
    <Link
      href="/seances"
      className="surface-tile mt-1 flex min-h-14 items-center gap-3 px-4 text-sm font-semibold text-fg"
    >
      <Clapperboard aria-hidden className="size-5 text-fg-muted" />
      <span className="flex-1">Toutes mes séances{count ? ` · ${count}` : ""}</span>
      <ChevronRight aria-hidden className="size-4 text-fg-muted" />
    </Link>
  );
}
