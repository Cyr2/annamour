import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

/** Back button, a centred title and an optional action on the right. */
export function ScreenTopBar({ back, title, action }: { back: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <header className="grid min-h-12 grid-cols-[44px_1fr_auto] items-center gap-3">
      <Link
        href={back}
        aria-label="Retour"
        className="lg-glass grid size-11 place-items-center rounded-full text-fg transition-transform duration-300 active:scale-90"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <div className="min-w-0 truncate text-center font-rounded-tight text-md font-extrabold text-fg">{title}</div>
      <div className="flex min-w-11 justify-end">{action}</div>
    </header>
  );
}
