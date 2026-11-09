import type { ReactNode } from "react";
import { cx } from "../../ui/cx.ts";

interface AccountRowProps {
  icon: ReactNode;
  title: string;
  detail?: string;
  onClick?: () => void;
  /** Shown on the right, e.g. « Actif ». */
  trailing?: ReactNode;
  tone?: "default" | "destructive";
  disabled?: boolean;
}

/** One line of the « Ton compte » card: an icon, what it does and a word about it. */
export function AccountRow({ icon, title, detail, onClick, trailing, tone = "default", disabled }: AccountRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex min-h-14 w-full cursor-pointer items-center gap-3.5 rounded-control px-2 py-2 text-left transition-colors duration-200",
        "enabled:hover:bg-fill-soft enabled:active:bg-fill-hover disabled:cursor-default",
        tone === "destructive" ? "text-danger" : "text-fg",
      )}
    >
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-fill-soft [&>svg]:size-5">
        {icon}
      </span>
      <span className="grid min-w-0 flex-1">
        <b className="text-sm font-semibold">{title}</b>
        {detail ? <small className="text-xs text-fg-muted">{detail}</small> : null}
      </span>
      {trailing}
    </button>
  );
}
