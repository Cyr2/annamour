import { Users } from "lucide-react";
import type { ReactNode } from "react";
import { plural } from "../../lib/format.ts";
import { Glass } from "../../ui/controls.tsx";
import { cx } from "../../ui/cx.ts";
import { HeartBadge } from "../../ui/HeartBadge.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import type { Person } from "../sessions/session-rules.ts";

interface PeopleRowProps {
  people: readonly Person[];
  favoriteId: string | null;
  totalSessions: number;
  /** null means « Tout le monde ». */
  selected: string | null;
  onSelect: (accountId: string | null) => void;
}

/** « Avec qui je regarde »: one row of bubbles, everyone once, most shared first. Tapping one filters the list. */
export function PeopleRow({ people, favoriteId, totalSessions, selected, onSelect }: PeopleRowProps) {
  return (
    <Glass className="surface-panel grid gap-3 p-4 sm:p-5">
      <h2 className="type-heading">Avec qui je regarde</h2>
      <fieldset className="-mx-1 flex min-w-0 gap-1 overflow-x-auto border-0 p-0 pb-1">
        <legend className="sr-only">Filtrer mes séances par personne</legend>
        <PersonChip
          label="Tout le monde"
          detail={plural(totalSessions, "séance")}
          pressed={selected === null}
          onPress={() => onSelect(null)}
        >
          <span className="grid size-14 place-items-center rounded-full bg-fill-strong text-fg">
            <Users className="size-6" />
          </span>
        </PersonChip>
        {people.map((person) => (
          <PersonChip
            key={person.accountId}
            label={person.name}
            detail={plural(person.sessionCount, "séance")}
            pressed={selected === person.accountId}
            onPress={() => onSelect(selected === person.accountId ? null : person.accountId)}
          >
            <span className="relative">
              <PresenceBubble name={person.name} color={person.color} size="md" />
              {person.accountId === favoriteId ? <HeartBadge /> : null}
            </span>
          </PersonChip>
        ))}
      </fieldset>
    </Glass>
  );
}

interface PersonChipProps {
  label: string;
  detail: string;
  pressed: boolean;
  onPress: () => void;
  children: ReactNode;
}

function PersonChip({ label, detail, pressed, onPress, children }: PersonChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${label}, ${detail}`}
      onClick={onPress}
      className={cx(
        "grid max-w-[136px] min-w-[84px] shrink-0 cursor-pointer justify-items-center gap-1.5 rounded-control px-2.5 py-2 transition-colors duration-200",
        pressed ? "bg-fill-strong" : "hover:bg-fill-soft",
      )}
    >
      <span aria-hidden>{children}</span>
      <b className="max-w-full truncate text-sm font-semibold text-fg">{label}</b>
      <small className="-mt-1 text-xs text-fg-muted">{detail}</small>
    </button>
  );
}
