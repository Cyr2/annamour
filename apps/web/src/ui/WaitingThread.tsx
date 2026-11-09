import type { BubbleColor } from "@annamour/protocol";
import type { ReactNode } from "react";
import { EmptyBubble } from "./EmptyBubble.tsx";
import { PresenceBubble } from "./PresenceBubble.tsx";
import { RedThread } from "./RedThread.tsx";

/** Two free places, not one: an evening is for 2 to 8 people, never a duo by default. */
const FREE_PLACES = [1, 2];

interface WaitingThreadProps {
  me: { name: string; color: BubbleColor };
  title: string;
  /** One short sentence: what will fill this place. */
  children: ReactNode;
  /** The one thing to do from here. */
  action: ReactNode;
}

/**
 * An empty state in the brand's voice: the red thread runs from me to free
 * places, slack and waiting, above a title, a sentence and one action.
 */
export function WaitingThread({ me, title, children, action }: WaitingThreadProps) {
  return (
    <div className="grid justify-items-center gap-4 py-2 text-center">
      <RedThread.Root synced={false} className="w-[min(19rem,100%)]">
        <RedThread.Line />
        <div className="flex items-center justify-between">
          <RedThread.Anchor index={0}>
            <PresenceBubble name={me.name} color={me.color} status="alone" size="md" />
          </RedThread.Anchor>
          {FREE_PLACES.map((index) => (
            <RedThread.Anchor key={index} index={index}>
              <EmptyBubble label="Une place libre" size="md" />
            </RedThread.Anchor>
          ))}
        </div>
      </RedThread.Root>
      <div className="grid justify-items-center gap-1">
        <strong className="type-heading">{title}</strong>
        <p className="max-w-[var(--am-measure)] text-sm text-balance text-fg-muted">{children}</p>
      </div>
      {action}
    </div>
  );
}
