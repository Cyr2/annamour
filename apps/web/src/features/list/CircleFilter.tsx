import { byRecentUse, circleTitle, othersIn } from "@annamour/protocol";
import { Users } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../ui/cx.ts";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { useAccount } from "../account/account.ts";
import { circleShortName } from "../circles/circle-rules.ts";
import { selectCircle, shownCircle, useCircles } from "../circles/circles.ts";

/**
 * « Avec qui ? » on « Notre liste »: « Tout », then each circle as its bubbles.
 * The pick is the same as on « Ce soir ». With one circle, nothing to pick.
 */
export function CircleFilter() {
  const me = useAccount((s) => s.account?.id ?? "");
  const circles = useCircles((s) => s.circles);
  const shown = useCircles((s) => shownCircle(s));
  if (circles.length < 2) return null;

  return (
    <fieldset className="-mx-1 flex min-w-0 gap-3 overflow-x-auto border-0 px-1 py-1 [scrollbar-width:none]">
      <legend className="sr-only">Avec qui ?</legend>
      <Choice label="Tout" pressed={shown === null} onPress={() => selectCircle(null)}>
        <span className="grid size-14 place-items-center rounded-full bg-fill-strong text-fg">
          <Users aria-hidden className="size-5" />
        </span>
      </Choice>
      {byRecentUse(circles).map((circle) => {
        const others = othersIn(circle, me).slice(0, 2);
        return (
          <Choice
            key={circle.id}
            label={circleShortName(circle, me)}
            fullLabel={circleTitle(circle, me)}
            pressed={shown === circle.id}
            onPress={() => selectCircle(circle.id)}
          >
            <span className="relative grid size-14 place-items-center">
              {others.length === 1 && others[0] ? (
                <PresenceBubble name={others[0].name} color={others[0].color} size="md" />
              ) : (
                others.map((person, index) => (
                  <span
                    key={person.accountId}
                    className={cx("absolute", index === 0 ? "top-0 left-0" : "right-0 bottom-0")}
                  >
                    <PresenceBubble name={person.name} color={person.color} size="sm" />
                  </span>
                ))
              )}
            </span>
          </Choice>
        );
      })}
    </fieldset>
  );
}

function Choice(props: {
  label: string;
  fullLabel?: string;
  pressed: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      aria-label={props.fullLabel}
      onClick={props.onPress}
      className="grid w-17 shrink-0 cursor-pointer justify-items-center gap-1.5 rounded-control py-1"
    >
      <span aria-hidden className={cx("rounded-full p-0.5", props.pressed && "ring-2 ring-accent")}>
        {props.children}
      </span>
      <span
        className={cx("w-full truncate text-center text-xs", props.pressed ? "font-bold text-fg" : "text-fg-muted")}
      >
        {props.label}
      </span>
    </button>
  );
}
