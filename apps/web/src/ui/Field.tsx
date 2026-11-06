import type { ReactNode } from "react";
import { cx } from "./cx.ts";

interface FieldProps {
  label: string;
  /** The id of the control the label names; omit for a group (it gets the label as a caption). */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/** A form control with its label above it. */
export function Field({ label, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cx("grid gap-[7px] text-left", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-xs font-semibold text-fg-muted">
          {label}
        </label>
      ) : (
        <span className="text-xs font-semibold text-fg-muted">{label}</span>
      )}
      {children}
    </div>
  );
}
