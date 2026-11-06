import type { ReactNode } from "react";
import { Link } from "wouter";
import { Glass } from "./controls.tsx";
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

/**
 * A link that looks like our Button: navigation stays a real link (new tab,
 * long press, history). The glass variant sits on real glisse Glass, so it
 * bends the backdrop like a Button does.
 */
export function LinkButton({
  href,
  children,
  icon,
  variant = "glass",
  size = "regular",
  label,
  className,
}: LinkButtonProps) {
  const link = (classes: string) => (
    <Link
      href={href}
      aria-label={label}
      title={children ? undefined : label}
      className={cx("lg-button am-button no-underline", classes)}
      data-variant={variant === "glass" ? undefined : variant}
      data-size={size}
      data-icon={icon ? (children ? "" : "only") : undefined}
    >
      {icon}
      {children}
    </Link>
  );

  if (variant === "filled") return link(cx("lg-glass", className));
  return (
    <Glass
      className={cx("inline-flex rounded-pill transition-transform duration-200 ease-out active:scale-95", className)}
    >
      {link("w-full bg-transparent")}
    </Glass>
  );
}
