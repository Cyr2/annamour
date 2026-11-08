import { type Circle, circleTitle, othersIn } from "@annamour/protocol";
import { Ellipsis, LogOut, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { inviteToCircle, inviteUrl } from "../../api/circles.ts";
import { errorMessage } from "../../api/http.ts";
import { Button } from "../../ui/controls.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { toast } from "../../ui/toast.ts";
import { eveningsLine } from "../circles/circle-rules.ts";
import { leaveCircle } from "../circles/circles.ts";
import { AccountRow } from "../profile/AccountRow.tsx";
import { CircleThread } from "./CircleThread.tsx";
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
  const _others = othersIn(circle, me);
  const title = circleTitle(circle, me);
  const invite = () =>
    void shareInvite(circle, me).catch((failure: unknown) => toast({ message: errorMessage(failure) }));
  const leave = () =>
    void leaveCircle(circle.id)
      .then(() => toast({ message: `Tu as quitté « ${title} »` }))
      .catch((failure: Error) => toast({ message: failure.message }));

  return (
    <li>
      <Surface className="surface-panel grid gap-4 p-5">
        <CircleThread circle={circle} me={me} />
        <div className="flex items-center gap-2">
          <div className="grid min-w-0 flex-1">
            <strong className="truncate font-rounded-tight text-md font-extrabold text-fg">{title}</strong>
            <span className="text-xs text-pretty text-fg-muted">{eveningsLine(circle, Date.now())}</span>
          </div>
          <Button icon={<UserPlus />} onClick={invite}>
            Inviter
          </Button>
          {/* A sheet rather than a pop-up menu: easier to reach and never cut off on a phone. */}
          <IconButton label={`Plus d'options pour « ${title} »`} icon={<Ellipsis />} onClick={() => setOptions(true)} />
        </div>
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
