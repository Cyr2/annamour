import type { BubbleColor } from "@annamour/protocol";

/** CSS value for a member's bubble colour (resolved from tokens.css). */
export function bubbleColor(color: BubbleColor): string {
  return `var(--am-bubble-${color})`;
}

/** French names for the bubble colours, for pickers and accessible labels. */
export const BUBBLE_COLOR_LABELS: Record<BubbleColor, string> = {
  peach: "Pêche",
  lilac: "Lilas",
  mint: "Menthe",
  sky: "Ciel",
  butter: "Beurre",
  rose: "Rose",
};
