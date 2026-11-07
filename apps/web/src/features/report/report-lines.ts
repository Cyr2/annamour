import { type DeviceEvening, TARGETS, type TargetCheck } from "@annamour/protocol";
import { formatDuration, plural } from "../../lib/format.ts";

/*
 * « Qualité de la séance » in plain French: one headline per person and
 * device, and each target with what the evening did.
 */

const percent = (share: number) =>
  `${(share * 100).toLocaleString("fr-FR", { maximumFractionDigits: share < 0.1 ? 1 : 0 })} %`;

const seconds = (value: number) => `${Math.round(value)} s`;

/** « Annou · iPad (lecteur Safari) » */
export function deviceTitle({ name, device, engine }: DeviceEvening): string {
  return `${name} · ${device} (lecteur ${engine === "native" ? "Safari" : "Annamour"})`;
}

/** « 2 coupures (47 s), 5,7 % du temps bloquée, 32 % en 234p » */
export function headline(evening: DeviceEvening): string {
  const lowest = evening.heights.find((bucket) => bucket.height === 234)?.share ?? 0;
  const stalls =
    evening.stallCount === 0
      ? "aucune coupure"
      : `${plural(evening.stallCount, "coupure")} (${seconds(evening.stallSeconds)})`;
  const frozen = `${percent(evening.targets.rebuffer.value ?? 0)} du temps bloqué`;
  return `${stalls}, ${frozen}, ${percent(lowest)} en 234p · ${formatDuration(evening.watchedSeconds)} regardé`;
}

export interface TargetLine {
  label: string;
  /** What the evening did, in words. */
  value: string;
  goal: string;
  met: boolean | null;
}

const show = (check: TargetCheck, format: (value: number) => string) =>
  check.value === null ? "pas encore mesuré" : format(check.value);

export function targetLines({ targets }: DeviceEvening): TargetLine[] {
  return [
    {
      label: "Temps bloqué",
      value: show(targets.rebuffer, percent),
      goal: `moins de ${percent(TARGETS.rebufferRatio)}`,
      met: targets.rebuffer.met,
    },
    {
      label: "Coupures par épisode",
      value: show(targets.stalls, (v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })),
      goal: `${TARGETS.stallsPerEpisode} au plus`,
      met: targets.stalls.met,
    },
    {
      label: "Durée d'une coupure",
      value: show(targets.stallLength, seconds),
      goal: `moins de ${TARGETS.stallSeconds} s`,
      met: targets.stallLength.met,
    },
    {
      label: "Temps en 234p",
      value: show(targets.lowest, percent),
      goal: `moins de ${percent(TARGETS.lowestShare)}`,
      met: targets.lowest.met,
    },
    {
      label: "Démarrage",
      value: show(targets.startup, (ms) => `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`),
      goal: `moins de ${TARGETS.startupMs / 1000} s`,
      met: targets.startup.met,
    },
  ];
}

/** « 234p » for the lightest bucket, « 640p et plus » for the source's. */
export function heightLabel(height: number): string {
  return height >= 640 ? "Qualité d'origine" : `${height}p`;
}
