import { useIdentity } from "../../sync/identity.ts";
import { GlassLink } from "../../ui/GlassLink.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { Wordmark } from "../../ui/Wordmark.tsx";

export function HomeTopBar() {
  const name = useIdentity((s) => s.name);
  const color = useIdentity((s) => s.color);
  return (
    <header className="flex min-h-12 items-center justify-between gap-3">
      <Wordmark />
      <GlassLink
        href="/profil"
        label={`Mon profil, ${name || "toi"}`}
        className="rounded-pill"
        linkClassName="flex min-h-11 items-center gap-2 py-[5px] pr-4 pl-[5px] text-sm font-semibold"
      >
        <span aria-hidden>
          <PresenceBubble name={name || "Toi"} color={color} size="xs" className="[&_[role=img]]:shadow-none" />
        </span>
        <span aria-hidden className="max-w-[12ch] truncate">
          {name || "Toi"}
        </span>
      </GlassLink>
    </header>
  );
}
