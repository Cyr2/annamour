import { Check } from "lucide-react";
import { cx } from "./cx.ts";

interface ChoiceRowProps {
  /** The radio group's name: rows sharing it are one choice. */
  name: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
}

/** One option of a list: a native radio, so arrows and screen readers work as anywhere else. */
export function ChoiceRow({ name, label, checked, onSelect }: ChoiceRowProps) {
  return (
    <label
      className={cx(
        "flex min-h-14 cursor-pointer items-center gap-3 rounded-control px-4 transition-colors duration-200",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--am-focus)]",
        checked ? "bg-accent-soft text-fg" : "bg-fill-soft text-fg hover:bg-fill-hover",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      <span className="min-w-0 flex-1 truncate font-rounded-tight font-extrabold">{label}</span>
      <span
        aria-hidden
        className={cx(
          "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200",
          checked ? "border-accent bg-accent text-on-accent" : "border-line-strong",
        )}
      >
        {checked ? <Check className="size-4" strokeWidth={3} /> : null}
      </span>
    </label>
  );
}
