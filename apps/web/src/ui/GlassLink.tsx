import type { ReactNode } from "react";
import { Link } from "wouter";
import { Glass } from "./controls.tsx";
import { cx } from "./cx.ts";
import { Surface } from "./Surface.tsx";

interface GlassLinkProps {
  href: string;
  children: ReactNode;
  /**
   * `glass` (small links: a pill, a back button) bends what is behind it;
   * `frost` (a whole card) is frosted glass, which costs nothing per frame.
   */
  material?: "glass" | "frost";
  /** The glass: its shape, size and place in the layout. */
  className?: string;
  /** The link inside, which fills the glass: its layout and text. */
  linkClassName?: string;
  /** Needed when the link shows no text. */
  label?: string;
}

/**
 * A link on glass. The link fills it, so it stays a real link (new tab, long
 * press, history). Pressing sinks it a little.
 */
export function GlassLink({ href, children, material = "glass", className, linkClassName, label }: GlassLinkProps) {
  const Material = material === "glass" ? Glass : Surface;
  return (
    <Material className={cx("transition-transform duration-200 ease-out active:scale-[0.97]", className)}>
      <Link
        href={href}
        aria-label={label}
        title={label}
        className={cx("size-full rounded-[inherit] text-fg no-underline", linkClassName)}
      >
        {children}
      </Link>
    </Material>
  );
}
