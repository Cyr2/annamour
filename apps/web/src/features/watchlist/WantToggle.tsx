import type { WatchlistItem } from "@annamour/protocol";
import { Heart } from "lucide-react";
import { m } from "motion/react";
import { useState } from "react";
import { spring } from "../../lib/motion.ts";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { Button } from "../../ui/controls.tsx";
import { othersWantingLine, wantToggleLabel } from "./watchlist-rules.ts";

interface WantToggleProps {
  item: WatchlistItem;
  me: string;
  onToggle: (want: boolean) => void;
}

/**
 * One heart to say « j'en ai envie », with how many want it, and beside it only the others: the
 * heart already says where I stand, so no line repeats it.
 */
export function WantToggle({ item, me, onToggle }: WantToggleProps) {
  const [taps, setTaps] = useState(0);
  const wanting = item.wantedBy.includes(me);
  const others = item.sharedWith
    .filter((person) => person.accountId !== me && item.wantedBy.includes(person.accountId))
    .map((person) => ({ id: person.accountId, name: person.name, color: person.color }));
  const count = others.length + (wanting ? 1 : 0);
  return (
    <div className="flex items-center gap-3">
      <Button
        aria-label={wantToggleLabel(item)}
        aria-pressed={wanting}
        tone={wanting ? "accent" : "default"}
        onClick={() => {
          setTaps((previous) => previous + 1);
          onToggle(!wanting);
        }}
        icon={
          // Keyed on the taps so each one replays the little bounce, but opening the sheet does not.
          <m.span
            key={taps}
            aria-hidden
            className="grid place-items-center"
            initial={taps ? { scale: wanting ? 0.6 : 1.15 } : false}
            animate={{ scale: 1 }}
            transition={spring.thread}
          >
            <Heart className={wanting ? "size-5 fill-current text-accent" : "size-5"} />
          </m.span>
        }
      >
        {count > 0 ? <span aria-hidden>{count}</span> : null}
      </Button>
      <p className="flex min-w-0 items-center gap-2">
        {others.length ? <BubbleStack people={others} className="shrink-0" /> : null}
        <span className="min-w-0 text-pretty">{othersWantingLine(item, me)}</span>
      </p>
    </div>
  );
}
