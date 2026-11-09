import { ArrowDown, ArrowUp, LogOut, Merge, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Sheet } from "../../ui/Sheet.tsx";
import { AccountRow } from "../profile/AccountRow.tsx";

interface CircleOptionsSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onRename: () => void;
  onLeave: () => void;
  /** Absent when the circle is already first (or last): moving is also a drag of its handle. */
  onMoveUp: (() => void) | undefined;
  onMoveDown: (() => void) | undefined;
  /** Present when another circle holds exactly the same people: « Réunir avec… ». */
  onReunite: (() => void) | undefined;
}

/** « ⋯ » on a circle: move it, rename it, reunite it with its twin, leave it. Each choice closes the sheet first. */
export function CircleOptionsSheet({ open, title, onClose, ...actions }: CircleOptionsSheetProps) {
  const row = (icon: ReactNode, label: string, detail: string, run: () => void, destructive = false) => (
    <AccountRow
      icon={icon}
      title={label}
      detail={detail}
      tone={destructive ? "destructive" : "default"}
      onClick={() => {
        onClose();
        run();
      }}
    />
  );

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="grid gap-1">
        {actions.onMoveUp ? row(<ArrowUp />, "Monter", "Plus haut dans tes cercles, partout", actions.onMoveUp) : null}
        {actions.onMoveDown
          ? row(<ArrowDown />, "Descendre", "Plus bas dans tes cercles, partout", actions.onMoveDown)
          : null}
        {row(<Pencil />, "Renommer", "Un nom pour tout le cercle", actions.onRename)}
        {actions.onReunite
          ? row(<Merge />, "Réunir avec…", "Un autre cercle a les mêmes personnes", actions.onReunite)
          : null}
        {row(<LogOut />, "Quitter le cercle", "Tu ne verras plus sa liste", actions.onLeave, true)}
      </div>
    </Sheet>
  );
}
