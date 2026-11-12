import type { SessionSummary } from "@annamour/protocol";
import { CircleCheck, Ellipsis, Link2, LogOut, Smile, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { joinNames } from "../../lib/format.ts";
import { Button } from "../../ui/controls.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { toast } from "../../ui/toast.ts";
import { AccountRow } from "../profile/AccountRow.tsx";
import { TitleRatings } from "../ratings/TitleRatings.tsx";
import { copySeanceLink } from "./copy-seance-link.tsx";
import { canMarkFinished, sessionTitle, titleToRateOf } from "./session-rules.ts";
import { deleteSession, finishSession, leaveSession } from "./sessions.ts";

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
  const [view, setView] = useState<"menu" | "delete" | "rate">("menu");
  const confirming = view === "delete";
  const title = sessionTitle(session);
  const rated = titleToRateOf(session);
  const close = () => {
    setOpen(false);
    setView("menu");
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
        {view === "rate" && rated ? (
          <div className="grid gap-5">
            <TitleRatings title={rated} />
            <Button onClick={() => setView("menu")}>Retour</Button>
          </div>
        ) : null}
        {confirming ? (
          <ConfirmDelete
            session={session}
            onCancel={() => setView("menu")}
            onConfirm={() => {
              close();
              run(deleteSession(session.code), `« ${title} » est supprimée pour tout le monde`);
            }}
          />
        ) : null}
        {view === "menu" ? (
          <div className="grid gap-1">
            {rated ? row(<Smile />, "Ton avis", "Adoré, aimé, bof… les autres le voient", () => setView("rate")) : null}
            {/* The cards leave the code out to stay short: it is read here, to give it out loud. */}
            {row(<Link2 />, "Copier le lien", `Code : ${session.code} · pour inviter quelqu'un`, () => {
              close();
              void copySeanceLink(session.code);
            })}
            {canMarkFinished(session)
              ? row(<CircleCheck />, "Marquer comme terminée", "Si vous l'avez finie pendant le générique", () => {
                  close();
                  run(finishSession(session.code), `« ${title} » est terminée`);
                })
              : null}
            {row(<LogOut />, "Quitter la séance", "Elle quitte tes séances ; les autres la gardent", () => {
              close();
              run(leaveSession(session.code), `Tu as quitté « ${title} »`);
            })}
            {session.createdByMe
              ? row(
                  <Trash2 />,
                  "Supprimer pour tous",
                  "Tu l'as créée : elle disparaît pour tout le monde",
                  () => setView("delete"),
                  true,
                )
              : null}
          </div>
        ) : null}
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
