import { Radio } from "lucide-react";

/**
 * In place of the timeline during a live stream: « En direct », and a way back
 * to the live edge for everyone after a pause.
 */
export function LiveRow({ onBackToLive }: { onBackToLive: () => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-2">
      <span className="flex items-center gap-1.5 text-xs font-bold text-fg">
        <span aria-hidden className="size-2 rounded-full bg-danger" />
        En direct
      </span>
      <button
        type="button"
        onClick={onBackToLive}
        className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent"
      >
        <Radio aria-hidden className="size-4" />
        Revenir au direct
      </button>
    </div>
  );
}
