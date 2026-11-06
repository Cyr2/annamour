import type { ReactNode } from "react";
import { Link } from "wouter";
import { Glass } from "./controls.tsx";
import { cx } from "./cx.ts";

interface GlassLinkProps {
  href: string;
  children: ReactNode;
  /** The glass: its shape, size and place in the layout. */
  className?: string;
  /** The link inside, which fills the glass: its layout and text. */
  linkClassName?: string;
  /** Needed when the link shows no text. */
  label?: string;
}

/**
 * A link on real Liquid Glass: glisse's Glass bends what is behind it and
 * lights its rim, which a bare `lg-glass` class cannot do. The link fills it,
 * so it stays a real link (new tab, long press, history). Pressing sinks it a little.
 */
export function GlassLink({ href, children, className, linkClassName, label }: GlassLinkProps) {
  return (
    <Glass className={cx("transition-transform duration-200 ease-out active:scale-[0.97]", className)}>
      <Link
        href={href}
        aria-label={label}
        title={label}
        className={cx("size-full rounded-[inherit] text-fg no-underline", linkClassName)}
      >
        {children}
      </Link>
    </Glass>
  );
}
