import type { DeviceEvening } from "@annamour/protocol";
import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { Surface } from "../../ui/Surface.tsx";
import {
  deviceTitle,
  headline,
  heightLabel,
  leadRows,
  measureLines,
  type TargetLine,
  targetLines,
} from "./report-lines.ts";
import { ShareRows } from "./ShareRows.tsx";

/** One person on one device: the evening in a sentence, time per quality and per lead, the finer measures, each target. */
export function DeviceCard({ evening }: { evening: DeviceEvening }) {
  const measures = measureLines(evening);
  return (
    <Surface className="surface-panel grid gap-5 p-5 sm:p-6">
      <div className="grid gap-1.5">
        <h2 className="font-rounded-tight text-md font-extrabold text-fg">{deviceTitle(evening)}</h2>
        <p className="text-sm text-pretty text-fg-muted">{headline(evening)}</p>
      </div>
      <ShareRows
        title="Temps par qualité"
        rows={evening.heights.map(({ height, share }) => ({ label: heightLabel(height), share }))}
      />
      <ShareRows title="Avance téléchargée pendant la lecture" rows={leadRows(evening)} />
      {measures.length > 0 ? (
        <section className="grid gap-2" aria-label="Mesures fines">
          <p className="type-label">Mesures fines</p>
          <ul className="grid gap-1.5 text-sm text-fg">
            {measures.map((line) => (
              <li key={line} className="text-pretty">
                {line}
              </li>
            ))}
          </ul>
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
