import type { SessionSummary } from "@annamour/protocol";
import { Ellipsis, Link2, LogOut, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { joinNames } from "../../lib/format.ts";
import { Button } from "../../ui/controls.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { toast } from "../../ui/toast.ts";
import { AccountRow } from "../profile/AccountRow.tsx";
import { copySeanceLink } from "./copy-seance-link.tsx";
import { sessionTitle } from "./session-rules.ts";
import { deleteSession, leaveSession } from "./sessions.ts";

interface SeanceOptionsProps {
  session: SessionSummary;
  /** `glass` stands alone on a poster; `plain` sits inside a card. */
  variant?: "glass" | "plain";
  className?: string;
  /** The séance left or deleted (e.g. leave its salon). */
  onGone?: () => void;
}

/**
 * « ⋯ » on a séance, wherever it shows: copy its link, leave it, or (for the
 * person who created it) delete it for everyone, which asks first.
 */
export function SeanceOptions({ session, variant = "plain", className, onGone }: SeanceOptionsProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const title = sessionTitle(session);
  const close = () => {
    setOpen(false);
    setConfirming(false);
  };
  const run = (work: Promise<void>, done: string) =>
    void work
      .then(() => {
        toast({ message: done });
        onGone?.();
      })
      .catch((failure: Error) => toast({ message: failure.message }));

  return (
    <>
      <IconButton
        label={`Plus d'options pour « ${title} »`}
        icon={<Ellipsis />}
        variant={variant}
        onClick={() => setOpen(true)}
        className={className}
      />
      <Sheet open={open} onClose={close} title={confirming ? "Supprimer pour tout le monde ?" : title}>
        {confirming ? (
          <ConfirmDelete
            session={session}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              close();
              run(deleteSession(session.code), `« ${title} » est supprimée pour tout le monde`);
            }}
          />
        ) : (
          <div className="grid gap-1">
            {row(<Link2 />, "Copier le lien", "Pour inviter quelqu'un à la rejoindre", () => {
              close();
              void copySeanceLink(session.code);
            })}
            {row(<LogOut />, "Quitter la séance", "Elle quitte tes séances ; les autres la gardent", () => {
              close();
              run(leaveSession(session.code), `Tu as quitté « ${title} »`);
            })}
            {session.createdByMe
              ? row(
                  <Trash2 />,
                  "Supprimer pour tous",
                  "Tu l'as créée : elle disparaît pour tout le monde",
                  () => setConfirming(true),
                  true,
                )
              : null}
          </div>
        )}
      </Sheet>
    </>
  );
}

function row(icon: ReactNode, title: string, detail: string, onClick: () => void, destructive = false) {
  return (
    <AccountRow
      icon={icon}
      title={title}
      detail={detail}
      onClick={onClick}
      tone={destructive ? "destructive" : "default"}
    />
  );
}

/** The last word before a séance goes for everyone: who else loses it, and what goes with it. */
function ConfirmDelete({
  session,
  onCancel,
  onConfirm,
}: {
  session: SessionSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Who already left it no longer sees it: nothing to lose for them.
  const others = session.participants.filter((person) => !person.left).map((person) => person.name);
  return (
    <div className="grid gap-5">
      <Sheet.Lede>
        « {sessionTitle(session)} » disparaîtra {others.length ? `aussi pour ${joinNames(others)}` : "de tes séances"},
        avec où vous en étiez et les films qu'elle a marqués vus.
      </Sheet.Lede>
      <Sheet.Actions>
        <Button onClick={onCancel}>Garder</Button>
        <Button tone="destructive" icon={<Trash2 />} onClick={onConfirm}>
          Supprimer pour tous
        </Button>
      </Sheet.Actions>
    </div>
  );
}
