import type { WatchlistItem } from "@annamour/protocol";
import { Check, Heart } from "lucide-react";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { cx } from "../../ui/cx.ts";
import { IconButton } from "../../ui/IconButton.tsx";
import { Poster } from "../../ui/Poster.tsx";
import { itemLine, wantsLabel, watchedLine } from "./watchlist-rules.ts";

interface WatchlistRowProps {
  item: WatchlistItem;
  me: string;
  now: number;
  onOpen: (item: WatchlistItem) => void;
  onWant: (item: WatchlistItem, want: boolean) => void;
}

/** One title of the list: poster, what it is and who added it, who wants it; the heart says « J'ai envie » in one tap. */
export function WatchlistRow({ item, me, now, onOpen, onWant }: WatchlistRowProps) {
  const watched = item.watchedAt !== undefined;
  const wanting = item.wantedBy.includes(me);
  const wanters = item.sharedWith
    .filter((person) => item.wantedBy.includes(person.accountId))
    .map((person) => ({ id: person.accountId, name: person.name, color: person.color }));

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="surface-tile flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3.5 p-2.5 text-left transition-colors hover:bg-fill-hover"
      >
        <span className="relative">
          <Poster title={item.title} />
          {watched ? (
            <span
              aria-hidden
              className="absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-full bg-success text-on-accent"
            >
              <Check className="size-3.5" strokeWidth={3} />
            </span>
          ) : null}
        </span>
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="truncate text-md font-semibold text-fg">{item.title.title}</span>
          <span className="text-xs text-fg-muted">{watched ? watchedLine(item, me, now) : itemLine(item, me)}</span>
          {!watched && wanters.length > 0 ? (
            <span className="flex items-center gap-2 text-xs text-fg-muted">
              <BubbleStack people={wanters} />
              {wantsLabel(wanters.length)}
            </span>
          ) : null}
        </span>
      </button>
      {watched ? null : (
        <IconButton
          label={wanting ? `Je n'en ai plus envie : ${item.title.title}` : `J'ai envie de voir ${item.title.title}`}
          aria-pressed={wanting}
          icon={<Heart className={cx(wanting && "fill-current text-accent")} />}
          onClick={() => onWant(item, !wanting)}
        />
      )}
    </li>
  );
}
