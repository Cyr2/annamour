import { useRoom } from "../../sync/room.ts";
import { cx } from "../../ui/cx.ts";
import { BackLink } from "../../ui/ScreenTopBar.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { CompactPresence } from "../session/Presence.tsx";

/** Back, the title, and one glass pill: who is here on the red thread, and whether everyone is in step. */
export function PlayerTopBar({ code }: { code: string }) {
  const title = useRoom((s) => s.room?.media.title ?? "Séance");
  const members = useRoom((s) => s.members);
  const you = useRoom((s) => s.you);
  const status = useRoom((s) => s.status);
  const waiting = members.some((m) => m.buffering);
  const online = status === "open";
  const label = !online ? "Reconnexion…" : waiting ? "En attente" : "Synchro";
  const together = members.length > 1;

  return (
    <div className="relative flex items-center gap-3">
      <BackLink href="/" label="Quitter le film" />
      <div className="min-w-0 flex-1 [text-shadow:var(--am-text-shadow)]">
        <strong className="block truncate font-rounded-tight text-md font-extrabold text-fg">{title}</strong>
        <span className="text-xs font-semibold text-fg-muted">Séance {code}</span>
      </div>
      <Surface className="flex min-h-11 items-center gap-2.5 rounded-pill py-1 pr-3.5 pl-1.5">
        {together ? <CompactPresence members={members} you={you} className="hidden min-w-[96px] sm:block" /> : null}
        {/* The pill's left padding is sized for the bubbles: without them, the dot gets its own room. */}
        <span
          role="status"
          className={cx("flex items-center gap-2 pl-2 text-xs font-semibold text-fg", together && "sm:pl-0")}
        >
          <span aria-hidden className={cx("size-2 rounded-full", online && !waiting ? "bg-success" : "bg-waiting")} />
          {label}
        </span>
      </Surface>
    </div>
  );
}
