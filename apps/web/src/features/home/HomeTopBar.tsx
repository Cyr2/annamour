import { Link } from "wouter";
import { useIdentity } from "../../sync/identity.ts";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { Wordmark } from "../../ui/Wordmark.tsx";

export function HomeTopBar() {
  const name = useIdentity((s) => s.name);
  const color = useIdentity((s) => s.color);
  return (
    <header className="flex min-h-12 items-center justify-between gap-3">
      <Wordmark />
      <Link
        href="/profil"
        aria-label={`Mon profil, ${name || "toi"}`}
        className="lg-glass flex min-h-11 items-center gap-2 rounded-pill py-[5px] pr-3.5 pl-[5px] text-sm font-semibold text-fg no-underline transition-transform duration-300 active:scale-95"
      >
        <span aria-hidden>
          <PresenceBubble name={name || "Toi"} color={color} size="xs" className="[&_[role=img]]:shadow-none" />
        </span>
        <span>{name || "Toi"}</span>
      </Link>
    </header>
  );
}
