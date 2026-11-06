import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "./cx.ts";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  /** Spoken name: an icon alone says nothing to a screen reader. */
  label: string;
  icon: ReactNode;
  /** `glass` stands alone on the screen; `plain` sits inside a glass capsule. */
  variant?: "glass" | "plain";
  ref?: Ref<HTMLButtonElement>;
}

/** A round 44px button holding one icon. */
export function IconButton({
  label,
  icon,
  variant = "plain",
  type = "button",
  className,
  ref,
  ...props
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-fg transition-[transform,background-color] duration-200 ease-out",
        "hover:bg-fill-hover active:scale-90 disabled:cursor-default disabled:opacity-40 [&>svg]:size-5",
        variant === "glass" && "lg-glass",
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
