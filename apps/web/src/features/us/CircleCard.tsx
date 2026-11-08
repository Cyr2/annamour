import { type Circle, circleTitle } from "@annamour/protocol";
import { Ellipsis, GripVertical, UserPlus } from "lucide-react";
import { useDragControls } from "motion/react";
import { Reorder } from "motion/react-m";
import { useState } from "react";
import { inviteToCircle, inviteUrl } from "../../api/circles.ts";
import { errorMessage } from "../../api/http.ts";
import { plural } from "../../lib/format.ts";
import { Button } from "../../ui/controls.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { toast } from "../../ui/toast.ts";
import { leaveCircle } from "../circles/circles.ts";
import { CircleOptionsSheet } from "./CircleOptionsSheet.tsx";
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

interface CircleCardProps {
  circle: Circle;
  me: string;
  /** Moves it a step up (-1) or down (+1) among my circles; absent at that end. */
  onMove: (delta: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** The drag of its handle ended: the new order can be saved. */
  onDrop: () => void;
}

/**
 * One circle in « Nous »: its people tied by the thread, how many evenings,
 * and what one can do with it. Its handle drags it among my circles.
 */
export function CircleCard({ circle, me, onMove, canMoveUp, canMoveDown, onDrop }: CircleCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [options, setOptions] = useState(false);
  const drag = useDragControls();
  const title = circleTitle(circle, me);
  const invite = () =>
    void shareInvite(circle, me).catch((failure: unknown) => toast({ message: errorMessage(failure) }));
  const leave = () =>
    void leaveCircle(circle.id)
      .then(() => toast({ message: `Tu as quitté « ${title} »` }))
      .catch((failure: Error) => toast({ message: failure.message }));

  return (
    <Reorder.Item as="li" value={circle} dragListener={false} dragControls={drag} onDragEnd={onDrop}>
      <Surface className="surface-panel grid gap-4 p-5">
        <CircleThread circle={circle} me={me} />
        <div className="flex items-center gap-2">
          {/* Only the handle starts a drag: the rest of the card scrolls the page and takes taps. */}
          <button
            type="button"
            aria-label={`Déplacer « ${title} »`}
            onPointerDown={(event) => drag.start(event)}
            className="-ml-2 grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-full text-fg-muted active:cursor-grabbing"
          >
            <GripVertical aria-hidden className="size-5" />
          </button>
          <div className="grid min-w-0 flex-1">
            <strong className="truncate font-rounded-tight text-md font-extrabold text-fg">{title}</strong>
            <span className="truncate text-xs text-fg-muted">{plural(circle.evenings, "soirée")}</span>
          </div>
          <Button icon={<UserPlus />} onClick={invite}>
            Inviter
          </Button>
          {/* A sheet rather than a pop-up menu: easier to reach and never cut off on a phone. */}
          <IconButton label={`Plus d'options pour « ${title} »`} icon={<Ellipsis />} onClick={() => setOptions(true)} />
        </div>
      </Surface>
      <CircleOptionsSheet
        open={options}
        title={title}
        onClose={() => setOptions(false)}
        onRename={() => setRenaming(true)}
        onLeave={leave}
        onMoveUp={canMoveUp ? () => onMove(-1) : undefined}
        onMoveDown={canMoveDown ? () => onMove(1) : undefined}
      />
      <NameCircleSheet open={renaming} onClose={() => setRenaming(false)} circle={circle} />
    </Reorder.Item>
  );
}
