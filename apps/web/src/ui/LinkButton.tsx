import type { ReactNode } from "react";
import { Link } from "wouter";
import { cx } from "./cx.ts";

interface LinkButtonProps {
  href: string;
  children?: ReactNode;
  icon?: ReactNode;
  variant?: "filled" | "glass";
  size?: "regular" | "large";
  /** Needed when there is no visible text. */
  label?: string;
  className?: string;
}

/** A link that looks like our Button: navigation stays a real link (new tab, long press, history). */
export function LinkButton({
  href,
  children,
  icon,
  variant = "glass",
  size = "regular",
  label,
  className,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={children ? undefined : label}
      className={cx("lg-glass lg-button am-button no-underline", className)}
      data-variant={variant === "glass" ? undefined : variant}
      data-size={size}
      data-icon={icon ? (children ? "" : "only") : undefined}
    >
      {icon}
      {children}
    </Link>
  );
}
