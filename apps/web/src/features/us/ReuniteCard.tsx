import { type Circle, circleTitle } from "@annamour/protocol";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { exit } from "../../lib/motion.ts";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { Button } from "../../ui/controls.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { offeredReunion } from "../circles/circle-rules.ts";
import { keepApart, useCircles } from "../circles/circles.ts";
import { ReuniteSheet } from "./ReuniteSheet.tsx";

/** At the top of « Nous »: the first two circles of the same people I have not chosen to keep apart. */
export function ReuniteOffer({ me }: { me: string }) {
  const circles = useCircles((s) => s.circles);
  const keptApart = useCircles((s) => s.keptApart);
  const [reuniting, setReuniting] = useState<readonly [Circle, Circle] | null>(null);
  const pair = offeredReunion(circles, keptApart);

  return (
    <>
      <AnimatePresence initial={false}>
        {pair ? (
          <ReuniteCard
            key={`${pair[0].id}+${pair[1].id}`}
            pair={pair}
            me={me}
            onReunite={() => setReuniting(pair)}
            onKeepApart={() => keepApart(pair[0].id, pair[1].id)}
          />
        ) : null}
      </AnimatePresence>
      <ReuniteSheet pair={reuniting} me={me} onClose={() => setReuniting(null)} />
    </>
  );
}

interface ReuniteCardProps {
  pair: readonly [Circle, Circle];
  me: string;
  onReunite: () => void;
  onKeepApart: () => void;
}

/** Two of my circles now hold the same people: « Nous » offers, once, to make them one. */
function ReuniteCard({ pair, me, onReunite, onKeepApart }: ReuniteCardProps) {
  const [first, second] = pair;
  const people = first.members.map((person) => ({ id: person.accountId, name: person.name, color: person.color }));

  return (
    <m.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exit.quick }}>
      <Surface className="surface-panel grid gap-4 p-5" role="region" aria-label="Deux cercles identiques">
        <div className="flex items-start gap-3">
          <BubbleStack people={people} className="mt-0.5 shrink-0" />
          <p className="text-sm text-fg">
            « {circleTitle(first, me)} » et « {circleTitle(second, me)} », c'est maintenant le même cercle.{" "}
            <b className="font-semibold">Les réunir ?</b>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:justify-end">
          <Button onClick={onKeepApart}>Garder les deux</Button>
          <Button variant="filled" onClick={onReunite}>
            Réunir
          </Button>
        </div>
      </Surface>
    </m.div>
  );
}
