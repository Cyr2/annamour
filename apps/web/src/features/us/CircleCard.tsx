import { type Circle, circleTitle, othersIn } from "@annamour/protocol";
import { Ellipsis, LogOut, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { inviteToCircle, inviteUrl } from "../../api/circles.ts";
import { errorMessage } from "../../api/http.ts";
import { plural } from "../../lib/format.ts";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { Button } from "../../ui/controls.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { toast } from "../../ui/toast.ts";
import { leaveCircle } from "../circles/circles.ts";
import { AccountRow } from "../profile/AccountRow.tsx";
import { NameCircleSheet } from "./NameCircleSheet.tsx";

/** Shares an invitation link: the phone's share sheet where there is one, else the clipboard. */
async function shareInvite(circle: Circle, me: string): Promise<void> {
  const { token } = await inviteToCircle(circle.id);
  const url = inviteUrl(token);
  const text = `Rejoins « ${circleTitle(circle, me)} » sur Annamour`;
  if (navigator.share) {
    await navigator.share({ title: "Annamour", text, url }).catch(() => {});
    return;
  }
  await navigator.clipboard.writeText(url);
  toast({ message: "Lien d'invitation copié" });
}

/** One circle in « Nous »: its people, how many evenings, and what one can do with it. */
export function CircleCard({ circle, me }: { circle: Circle; me: string }) {
  const [renaming, setRenaming] = useState(false);
  const [options, setOptions] = useState(false);
  const others = othersIn(circle, me);
  const title = circleTitle(circle, me);
  const invite = () =>
    void shareInvite(circle, me).catch((failure: unknown) => toast({ message: errorMessage(failure) }));
  const leave = () =>
    void leaveCircle(circle.id)
      .then(() => toast({ message: `Tu as quitté « ${title} »` }))
      .catch((failure: Error) => toast({ message: failure.message }));

  return (
    <li className="w-44 shrink-0">
      <Surface className="surface-panel flex h-full flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <BubbleStack people={others.map((p) => ({ id: p.accountId, name: p.name, color: p.color }))} />
          {/* A sheet, not a pop-up menu: the row of circles scrolls and would cut a menu off. */}
          <IconButton label={`Plus d'options pour « ${title} »`} icon={<Ellipsis />} onClick={() => setOptions(true)} />
        </div>
        <strong className="line-clamp-2 font-rounded-tight text-md font-extrabold text-fg">{title}</strong>
        <span className="text-xs text-fg-muted">{plural(circle.evenings, "soirée")}</span>
        <Button icon={<UserPlus />} onClick={invite} className="mt-auto w-full">
          Inviter
        </Button>
      </Surface>
      <Sheet open={options} onClose={() => setOptions(false)} title={title}>
        <div className="grid gap-1">
          <AccountRow
            icon={<Pencil />}
            title="Renommer"
            detail="Un nom pour tout le cercle"
            onClick={() => {
              setOptions(false);
              setRenaming(true);
            }}
          />
          <AccountRow
            icon={<LogOut />}
            title="Quitter le cercle"
            detail="Tu ne verras plus sa liste"
            tone="destructive"
            onClick={() => {
              setOptions(false);
              leave();
            }}
          />
        </div>
      </Sheet>
      <NameCircleSheet open={renaming} onClose={() => setRenaming(false)} circle={circle} />
    </li>
  );
}
