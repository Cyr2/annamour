import { type Circle, circleTitle, othersIn } from "@annamour/protocol";
import { LogOut, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { inviteToCircle, inviteUrl } from "../../api/circles.ts";
import { errorMessage } from "../../api/http.ts";
import { plural } from "../../lib/format.ts";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { Button, Menu } from "../../ui/controls.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { toast } from "../../ui/toast.ts";
import { leaveCircle } from "../circles/circles.ts";
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
  const others = othersIn(circle, me);
  const title = circleTitle(circle, me);
  const invite = () =>
    void shareInvite(circle, me).catch((failure: unknown) => toast({ message: errorMessage(failure) }));
  const leave = () =>
    void leaveCircle(circle.id)
      .then(() => toast({ message: `Tu as quitté « ${title} »` }))
      .catch((failure: Error) => toast({ message: failure.message }));

  return (
    <li>
      <Surface className="surface-panel grid gap-3 p-4">
        <div className="flex items-center gap-3">
          <BubbleStack people={others.map((p) => ({ id: p.accountId, name: p.name, color: p.color }))} />
          <div className="grid min-w-0 flex-1">
            <strong className="truncate font-rounded-tight text-md font-extrabold text-fg">{title}</strong>
            <span className="text-xs text-fg-muted">
              {plural(circle.members.length, "personne")} · {plural(circle.evenings, "soirée")}
            </span>
          </div>
          <Menu
            aria-label={`Plus d'options pour « ${title} »`}
            items={[
              { label: "Renommer", icon: <Pencil />, onSelect: () => setRenaming(true) },
              "separator",
              { label: "Quitter le cercle", icon: <LogOut />, destructive: true, onSelect: leave },
            ]}
          />
        </div>
        <Button icon={<UserPlus />} onClick={invite} className="justify-self-start">
          Inviter
        </Button>
      </Surface>
      <NameCircleSheet open={renaming} onClose={() => setRenaming(false)} circle={circle} />
    </li>
  );
}
