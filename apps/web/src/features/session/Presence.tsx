import type { Member } from "@annamour/protocol";
import type { ReactNode } from "react";
import { EmptyBubble } from "../../ui/EmptyBubble.tsx";
import { type BubbleSize, PresenceBubble, type PresenceStatus } from "../../ui/PresenceBubble.tsx";
import { RedThread } from "../../ui/RedThread.tsx";

interface PresenceProps {
  members: Member[];
  you: string | null;
  className?: string;
}

/** Me first, then the others; the thread is taut only when everyone is here and in step. */
export function presenceOf(members: Member[], you: string | null) {
  const me = members.find((m) => m.id === you);
  const others = members.filter((m) => m.id !== you);
  const alone = others.length === 0;
  return {
    ordered: me ? [me, ...others] : others,
    alone,
    synced: !alone && members.every((m) => !m.buffering),
    statusOf: (m: Member): PresenceStatus => (m.buffering ? "waiting" : alone ? "alone" : "here"),
  };
}

function Thread({ synced, className, children }: { synced: boolean; className?: string; children: ReactNode }) {
  return (
    <RedThread.Root synced={synced} className={className}>
      <RedThread.Line />
      <ul className="flex items-start justify-between gap-4">{children}</ul>
    </RedThread.Root>
  );
}

function FreeSeat({ index, size }: { index: number; size: BubbleSize }) {
  return (
    <li>
      <RedThread.Anchor index={index}>
        <EmptyBubble size={size} label="Une place libre" />
      </RedThread.Anchor>
    </li>
  );
}

/** The salon: big bubbles with each name and what they are doing, and a free seat while alone. */
export function SalonPresence({ members, you, className }: PresenceProps) {
  const { ordered, alone, synced, statusOf } = presenceOf(members, you);
  return (
    <Thread synced={synced} className={className}>
      {ordered.map((member, index) => (
        <li key={member.id}>
          <RedThread.Anchor index={index}>
            <PresenceBubble name={member.name} color={member.color} size="lg" status={statusOf(member)}>
              <PresenceBubble.Caption>
                {member.id === you ? `${member.name} (toi)` : member.name}
              </PresenceBubble.Caption>
              <PresenceBubble.Status>
                {member.buffering ? "Charge la vidéo…" : alone ? "Prêt" : "En phase"}
              </PresenceBubble.Status>
            </PresenceBubble>
          </RedThread.Anchor>
        </li>
      ))}
      {alone ? <FreeSeat index={ordered.length} size="lg" /> : null}
    </Thread>
  );
}

/** The player's top bar: small bubbles only. */
export function CompactPresence({ members, you, className }: PresenceProps) {
  const { ordered, synced, statusOf } = presenceOf(members, you);
  return (
    <Thread synced={synced} className={className}>
      {ordered.map((member, index) => (
        <li key={member.id}>
          <RedThread.Anchor index={index}>
            <PresenceBubble name={member.name} color={member.color} size="sm" status={statusOf(member)} />
          </RedThread.Anchor>
        </li>
      ))}
    </Thread>
  );
}
