import type { DeviceEvening } from "@annamour/protocol";
import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { Progress } from "../../ui/Progress.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { deviceTitle, headline, heightLabel, type TargetLine, targetLines } from "./report-lines.ts";

/** One person on one device: the evening in a sentence, time per quality, and each target. */
export function DeviceCard({ evening }: { evening: DeviceEvening }) {
  return (
    <Surface className="surface-panel grid gap-5 p-5 sm:p-6">
      <div className="grid gap-1.5">
        <h2 className="font-rounded-tight text-md font-extrabold text-fg">{deviceTitle(evening)}</h2>
        <p className="text-sm text-pretty text-fg-muted">{headline(evening)}</p>
      </div>
      {evening.heights.length > 0 ? (
        <section className="grid gap-2.5" aria-label="Temps passé par qualité">
          <p className="type-label">Temps par qualité</p>
          {evening.heights.map(({ height, share }) => (
            <div key={height} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-sm">
              <span className="text-fg">{heightLabel(height)}</span>
              <Progress.Bar value={share} label={`${heightLabel(height)} : ${Math.round(share * 100)} % du temps`} />
              <span className="text-right tabular-nums text-fg-muted">{Math.round(share * 100)} %</span>
            </div>
          ))}
        </section>
      ) : null}
      <section className="grid gap-2" aria-label="Objectifs">
        <p className="type-label">Objectifs</p>
        <ul className="grid gap-2">
          {targetLines(evening).map((line) => (
            <TargetRow key={line.label} line={line} />
          ))}
        </ul>
      </section>
    </Surface>
  );
}

function TargetRow({ line }: { line: TargetLine }) {
  const Icon = line.met === null ? CircleDashed : line.met ? CircleCheck : CircleX;
  const state = line.met === null ? "pas encore mesuré" : line.met ? "atteint" : "pas atteint";
  const color = line.met === null ? "text-fg-muted" : line.met ? "text-success" : "text-danger";
  return (
    <li className="grid grid-cols-[1.25rem_1fr] items-start gap-2.5 text-sm">
      <Icon aria-hidden className={`mt-0.5 size-5 ${color}`} />
      <p className="text-pretty">
        <span className="text-fg">
          {line.label} : {line.value}
        </span>
        <span className="text-fg-muted">
          {" "}
          — objectif {line.goal} ({state})
        </span>
      </p>
    </li>
  );
}
