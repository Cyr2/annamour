import { circleTitle, othersIn } from "@annamour/protocol";
import { Users } from "lucide-react";
import type { ReactNode } from "react";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { cx } from "../../ui/cx.ts";
import { useAccount } from "../account/account.ts";
import { selectCircle, shownCircle, useCircles } from "./circles.ts";

/**
 * « Avec qui ce soir ? »: one chip per circle, then « Tout ». Picking one
 * changes what the whole screen offers. With a single circle (a couple) there
 * is nothing to pick, so nothing shows.
 */
export function CircleSwitcher({ legend = "Avec qui ce soir ?" }: { legend?: string }) {
  const me = useAccount((s) => s.account?.id ?? "");
  const circles = useCircles((s) => s.circles);
  const shown = useCircles((s) => shownCircle(s));
  if (circles.length < 2) return null;

  return (
    <fieldset className="-m-1 flex min-w-0 flex-wrap gap-1.5 border-0 p-1">
      <legend className="mb-1.5 px-1 text-sm font-semibold text-fg-muted">{legend}</legend>
      {circles.map((circle) => (
        <Chip
          key={circle.id}
          label={circleTitle(circle, me)}
          pressed={shown === circle.id}
          onPress={() => selectCircle(circle.id)}
        >
          <BubbleStack people={othersIn(circle, me).map((p) => ({ id: p.accountId, name: p.name, color: p.color }))} />
        </Chip>
      ))}
      <Chip label="Tout" pressed={shown === null} onPress={() => selectCircle(null)}>
        <span className="grid size-6 place-items-center rounded-full bg-fill-strong text-fg">
          <Users className="size-3.5" />
        </span>
      </Chip>
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
        "flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors duration-200",
        pressed ? "border-transparent bg-fill-strong text-fg" : "border-line text-fg-muted hover:bg-fill-soft",
      )}
    >
      <span aria-hidden>{children}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
