import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { useRoom } from "../../sync/room.ts";
import { Glass } from "../../ui/controls.tsx";
import { CompactPresence } from "../session/Presence.tsx";

/** Back, the title, who is here on the red thread, and whether everyone is in step. */
export function PlayerTopBar({ code }: { code: string }) {
  const title = useRoom((s) => s.room?.media.title ?? "Séance");
  const members = useRoom((s) => s.members);
  const you = useRoom((s) => s.you);
  const status = useRoom((s) => s.status);
  const waiting = members.some((m) => m.buffering);
  const online = status === "open";
  const label = !online ? "Reconnexion…" : waiting ? "En attente" : "Synchro";

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/"
        aria-label="Quitter le film"
        className="lg-glass grid size-11 shrink-0 place-items-center rounded-full text-fg active:scale-90"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-md font-semibold text-fg">{title}</strong>
        <span className="text-xs text-fg-muted">Séance {code}</span>
      </div>
      {members.length > 1 ? (
        <Glass className="hidden rounded-pill px-2.5 py-1.5 sm:block">
          <CompactPresence members={members} you={you} className="min-w-[104px]" />
        </Glass>
      ) : null}
      <Glass
        role="status"
        className="flex min-h-[34px] items-center gap-2 rounded-pill px-3 text-xs font-semibold text-fg-muted"
      >
        <span aria-hidden className={`size-2 rounded-full ${online && !waiting ? "bg-success" : "bg-waiting"}`} />
        {label}
      </Glass>
    </div>
  );
}
