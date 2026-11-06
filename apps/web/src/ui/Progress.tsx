import type { ReactNode } from "react";
import { cx } from "./cx.ts";

/*
 * How far into a video, in the thread colour. `value` goes from 0 to 1.
 *
 *   <Progress.Bar value={0.56} label="56 % regardé" />
 *   <Progress.Ring value={0.56} label="56 % regardé">…</Progress.Ring>
 */

interface ProgressProps {
  value: number;
  label: string;
  className?: string;
}

function percentOf(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

function Bar({ value, label, className }: ProgressProps) {
  const percent = percentOf(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cx("h-1 overflow-hidden rounded-full bg-fill-strong", className)}
    >
      <div className="h-full rounded-full bg-thread" style={{ width: `${percent}%` }} />
    </div>
  );
}

const RADIUS = 21;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Ring({ value, label, className, children }: ProgressProps & { children?: ReactNode }) {
  const percent = percentOf(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cx("relative grid size-14 shrink-0 place-items-center", className)}
    >
      <svg viewBox="0 0 48 48" aria-hidden className="absolute inset-0 size-full -rotate-90">
        <circle cx="24" cy="24" r={RADIUS} fill="none" strokeWidth="3" className="stroke-fill-strong" />
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className="stroke-thread"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
        />
      </svg>
      {children}
    </div>
  );
}

export const Progress = { Bar, Ring };
