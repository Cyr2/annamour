import type { WatchlistItem } from "@annamour/protocol";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { toast } from "../../ui/toast.ts";
import { AccountRow } from "../profile/AccountRow.tsx";
import { markWatched, removeItem } from "./watchlist.ts";
import {
  actionAudience,
  removalNeedsConfirmation,
  removalWarning,
  removedToast,
  watchedToast,
} from "./watchlist-rules.ts";

interface WatchlistItemActionsProps {
  item: WatchlistItem;
  me: string;
  /** « Retirer » when others see the title: the sheet asks first. */
  onConfirmRemoval: () => void;
  onClose: () => void;
}

const report = (work: Promise<void>, done: string) =>
  void work.then(() => toast({ message: done })).catch((failure: Error) => toast({ message: failure.message }));

/** Takes the title out for everyone who sees it, then closes the sheet. */
export function removeForEveryone(item: WatchlistItem, me: string, onClose: () => void): void {
  onClose();
  report(removeItem(item.id), removedToast(item, me));
}

/**
 * « C'est vu » and « Retirer de la liste »: both count for everyone who sees the title,
 * so each says for whom.
 */
export function WatchlistItemActions({ item, me, onConfirmRemoval, onClose }: WatchlistItemActionsProps) {
  const watched = item.watchedAt !== undefined;
  const audience = actionAudience(item, me);
  const myself = item.sharedWith.find((person) => person.accountId === me);
  return (
    <div className="grid gap-1">
      <AccountRow
        icon={watched ? <RotateCcw /> : <Check />}
        title={watched ? "Pas encore vu" : "C'est vu"}
        detail={audience}
        onClick={() => report(markWatched(item.id, !watched, myself), watchedToast(item, me, !watched))}
      />
      <AccountRow
        icon={<Trash2 />}
        title="Retirer de la liste"
        detail={audience}
        tone="destructive"
        onClick={() => (removalNeedsConfirmation(item, me) ? onConfirmRemoval() : removeForEveryone(item, me, onClose))}
      />
    </div>
  );
}

/** The last word before a title leaves the others' lists too: who loses it, and what goes with it. */
export function ConfirmRemoval({
  item,
  me,
  onCancel,
  onConfirm,
}: {
  item: WatchlistItem;
  me: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="grid gap-5">
      <Sheet.Lede>{removalWarning(item, me)}</Sheet.Lede>
      <Sheet.Actions>
        <Button onClick={onCancel}>Garder</Button>
        <Button tone="destructive" icon={<Trash2 />} onClick={onConfirm}>
          Retirer pour tous
        </Button>
      </Sheet.Actions>
    </div>
  );
}
