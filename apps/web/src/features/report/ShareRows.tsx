import { Progress } from "../../ui/Progress.tsx";

export interface ShareRow {
  label: string;
  /** Between 0 and 1. */
  share: number;
}

/** A titled list of bars, each a share of the evening (« Temps par qualité », « Avance téléchargée »). */
export function ShareRows({ title, rows }: { title: string; rows: readonly ShareRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="grid gap-2.5" aria-label={title}>
      <p className="type-label">{title}</p>
      {rows.map(({ label, share }) => (
        <div key={label} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-sm">
          <span className="text-fg">{label}</span>
          <Progress.Bar value={share} label={`${label} : ${Math.round(share * 100)} % du temps`} />
          <span className="text-right tabular-nums text-fg-muted">{Math.round(share * 100)} %</span>
        </div>
      ))}
    </section>
  );
}
