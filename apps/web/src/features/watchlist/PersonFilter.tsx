import type { Participant } from "@annamour/protocol";
import { Users } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../ui/cx.ts";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";

interface PersonFilterProps {
  people: readonly Participant[];
  /** null means « Tout le monde ». */
  selected: string | null;
  onSelect: (accountId: string | null) => void;
  legend: string;
  /** Several people may be picked (sharing a title); by default one, or everyone (filtering). */
  multiple?: readonly string[];
}

/** One row of bubbles: « Tout le monde », then each person once. Like « Avec qui je regarde ». */
export function PersonFilter({ people, selected, onSelect, legend, multiple }: PersonFilterProps) {
  const isPressed = (id: string | null) =>
    multiple ? (id === null ? multiple.length === 0 : multiple.includes(id)) : selected === id;
  return (
    <fieldset className="-m-1 flex min-w-0 flex-wrap gap-1 border-0 p-1">
      <legend className="sr-only">{legend}</legend>
      <Chip label="Tout le monde" pressed={isPressed(null)} onPress={() => onSelect(null)}>
        <span className="grid size-9 place-items-center rounded-full bg-fill-strong text-fg">
          <Users className="size-4" />
        </span>
      </Chip>
      {people.map((person) => (
        <Chip
          key={person.accountId}
          label={person.name}
          pressed={isPressed(person.accountId)}
          onPress={() => onSelect(person.accountId)}
        >
          <PresenceBubble name={person.name} color={person.color} size="sm" />
        </Chip>
      ))}
    </fieldset>
  );
}

function Chip({
  label,
  pressed,
  onPress,
  children,
}: {
  label: string;
  pressed: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cx(
        "grid min-w-[4.5rem] shrink-0 cursor-pointer justify-items-center gap-1 rounded-control px-2 py-1.5 transition-colors duration-200",
        pressed ? "bg-fill-strong" : "hover:bg-fill-soft",
      )}
    >
      <span aria-hidden>{children}</span>
      <span className="max-w-[6.5rem] truncate text-xs font-semibold text-fg">{label}</span>
    </button>
  );
}
