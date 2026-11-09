import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { GlassLink } from "./GlassLink.tsx";

/** A round glass back button, for the screen top bar and the player. */
export function BackLink({ href, label = "Retour" }: { href: string; label?: string }) {
  return (
    <GlassLink
      href={href}
      label={label}
      className="size-11 shrink-0 rounded-full"
      linkClassName="grid place-items-center"
    >
      <ChevronLeft className="size-5" aria-hidden />
    </GlassLink>
  );
}

/**
 * Back button and a centred title, balanced on the right by an action (`end`) or an empty column.
 * Without `back` (a screen of the tab bar, which is its own way back), the title alone.
 */
export function ScreenTopBar({ back, title, end }: { back?: string; title?: ReactNode; end?: ReactNode }) {
  return (
    <header className="grid min-h-12 grid-cols-[44px_1fr_44px] items-center gap-3">
      {back ? <BackLink href={back} /> : <span aria-hidden />}
      <div className="min-w-0 truncate text-center font-rounded-tight text-md font-extrabold text-fg">{title}</div>
      {end ?? <span aria-hidden />}
    </header>
  );
}
