import type { BubbleColor } from "@annamour/protocol";
import { bubbleColor } from "./colors.ts";
import { cx } from "./cx.ts";

export interface StackedPerson {
  id: string;
  name: string;
  color: BubbleColor;
  /** Was there, then left: shown faded. */
  left?: boolean;
}

/** A few small overlapping bubbles: who was there. Decorative: say the names in text next to it. */
export function BubbleStack({ people, className }: { people: readonly StackedPerson[]; className?: string }) {
  return (
    <span aria-hidden className={cx("flex -space-x-1.5", className)}>
      {people.map((person) => (
        <span
          key={person.id}
          className={cx(
            "grid size-6 place-items-center rounded-full font-rounded-tight text-[0.6875rem] font-extrabold text-on-accent ring-2 ring-surface",
            person.left && "opacity-40",
          )}
          style={{ backgroundColor: bubbleColor(person.color) }}
        >
          {person.name.trim().at(0)?.toLocaleUpperCase("fr") ?? "?"}
        </span>
      ))}
    </span>
  );
}
