import type { Circle } from "@annamour/protocol";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { RedThread } from "../../ui/RedThread.tsx";
import { isCloseCircle } from "../circles/circle-rules.ts";

/** Beyond this, the bubbles would crowd a phone's width. */
const MAX_BUBBLES = 4;

/**
 * A circle's people tied by the red thread, me first: taut when they watched
 * together this week, slack and swaying like on « Ce soir » otherwise.
 */
export function CircleThread({ circle, me }: { circle: Circle; me: string }) {
  const people = [
    ...circle.members.filter((p) => p.accountId === me),
    ...circle.members.filter((p) => p.accountId !== me),
  ].slice(0, MAX_BUBBLES);

  return (
    <RedThread.Root synced={isCloseCircle(circle, Date.now())} className="px-2">
      <RedThread.Line />
      <div className="flex items-center justify-between" aria-hidden>
        {people.map((person, index) => (
          <RedThread.Anchor key={person.accountId} index={index}>
            <PresenceBubble name={person.name} color={person.color} status="here" size="md" />
          </RedThread.Anchor>
        ))}
      </div>
    </RedThread.Root>
  );
}
