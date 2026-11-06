import { BUBBLE_COLORS, type BubbleColor } from "@annamour/protocol";
import { BUBBLE_COLOR_LABELS, bubbleColor } from "./colors.ts";
import { cx } from "./cx.ts";

interface ColorPickerProps {
  value: BubbleColor;
  onValueChange: (color: BubbleColor) => void;
  label: string;
  className?: string;
}

/** The six bubble colours; the chosen one wears a milk ring. */
export function ColorPicker({ value, onValueChange, label, className }: ColorPickerProps) {
  return (
    <fieldset className={cx("flex flex-wrap gap-2 border-0 p-0", className)}>
      <legend className="sr-only">{label}</legend>
      {BUBBLE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={BUBBLE_COLOR_LABELS[color]}
          aria-pressed={color === value}
          onClick={() => onValueChange(color)}
          className={cx(
            "relative size-11 cursor-pointer rounded-full transition-transform duration-300 ease-out active:scale-[0.88]",
            "after:absolute after:-inset-1 after:rounded-full after:border-2 after:border-fg after:transition-opacity",
            color === value ? "after:opacity-100" : "after:opacity-0",
          )}
          style={{ backgroundColor: bubbleColor(color) }}
        />
      ))}
    </fieldset>
  );
}
