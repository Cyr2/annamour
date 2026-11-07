import { type Circle, othersIn } from "@annamour/protocol";
import { EmptyBubble } from "../../ui/EmptyBubble.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { RedThread } from "../../ui/RedThread.tsx";
import { useAccount } from "../account/account.ts";

/** Beyond this, a circle's thread would crowd a phone's width. */
const MAX_OTHERS = 3;

/**
 * The home's promise, kept from the first home: the red thread, then « Une
 * soirée ensemble ». The thread runs from me to the people of the circle on
 * screen, taut; with nobody chosen, it waits, slack, for a free place.
 */
export function TonightHero({ circle }: { circle: Circle | null }) {
  const account = useAccount((s) => s.account);
  const others = circle && account ? othersIn(circle, account.id).slice(0, MAX_OTHERS) : [];
  const together = others.length > 0;

  return (
    <header className="grid justify-items-center gap-3 text-center">
      <RedThread.Root synced={together} className="mb-2 w-[min(20rem,78%)]">
        <RedThread.Line />
        <div className="flex items-center justify-between">
          <RedThread.Anchor index={0}>
            <PresenceBubble
              name={account?.name ?? "Toi"}
              color={account?.color ?? "peach"}
              status={together ? "here" : "alone"}
              size="md"
            />
          </RedThread.Anchor>
          {together ? (
            others.map((person, index) => (
              <RedThread.Anchor key={person.accountId} index={index + 1}>
                <PresenceBubble name={person.name} color={person.color} status="here" size="md" />
              </RedThread.Anchor>
            ))
          ) : (
            <RedThread.Anchor index={1}>
              <EmptyBubble label="Une place libre" size="md" />
            </RedThread.Anchor>
          )}
        </div>
      </RedThread.Root>
      <h1 className="type-display">Une soirée ensemble</h1>
    </header>
  );
}
