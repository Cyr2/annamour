import { RATING_WORDS, RATINGS, type Rating } from "@annamour/protocol";
import { m } from "motion/react";
import { spring } from "../lib/motion.ts";
import { cx } from "./cx.ts";

interface RatingPickerProps {
  value: Rating | undefined;
  /** The avis picked, or undefined when the one chosen is touched again (taken back). */
  onChange: (rating: Rating | undefined) => void;
  /** What the group is about, for screen readers (« Ton avis sur Verity »). */
  label: string;
  disabled?: boolean;
}

/** Four faces, from « Adoré » to « Pas pour moi »: one touch picks, a second takes it back. */
export function RatingPicker({ value, onChange, label, disabled = false }: RatingPickerProps) {
  return (
    <fieldset className="grid min-w-0 grid-cols-4 gap-2">
      <legend className="sr-only">{label}</legend>
      {RATINGS.map((rating) => {
        const chosen = value === rating;
        const { emoji, label: word } = RATING_WORDS[rating];
        return (
          <button
            key={rating}
            type="button"
            aria-pressed={chosen}
            disabled={disabled}
            onClick={() => onChange(chosen ? undefined : rating)}
            className={cx(
              "grid min-h-11 justify-items-center gap-1 rounded-control px-1 py-2 text-xs font-semibold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60",
              chosen ? "bg-accent-soft text-fg ring-2 ring-accent" : "bg-fill-soft text-fg-muted hover:bg-fill-hover",
            )}
          >
            {/* Re-keyed on the choice so picking it gives one small spring, not every render. */}
            <m.span
              key={chosen ? "chosen" : "idle"}
              aria-hidden
              className="text-2xl leading-none"
              initial={chosen ? { scale: 0.7 } : false}
              animate={{ scale: 1 }}
              transition={spring.thread}
            >
              {emoji}
            </m.span>
            <span>{word}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
