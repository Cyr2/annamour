import { type DeviceEvening, LEAD_BUCKETS, TARGETS, type TargetCheck } from "@annamour/protocol";
import { formatDuration, plural } from "../../lib/format.ts";

/*
 * « Qualité de la séance » in plain French: one headline per person and
 * device, and each target with what the evening did.
 */

const percent = (share: number) =>
  `${(share * 100).toLocaleString("fr-FR", { maximumFractionDigits: share < 0.1 ? 1 : 0 })} %`;

const seconds = (value: number) => `${Math.round(value)} s`;

const playerName = (engine: DeviceEvening["engine"]) => `lecteur ${engine === "native" ? "Safari" : "Annamour"}`;

/** « Anna · iPad (lecteur Safari) » */
export function deviceTitle({ name, device, engine }: DeviceEvening): string {
  return `${name} · ${device} (${playerName(engine)})`;
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

/** 45 → « 45 s », 130 → « 2 min 10 », 3725 → « 1 h 02 ». */
export function shortDuration(value: number): string {
  const total = Math.max(0, Math.round(value));
  if (total < 60) return `${total} s`;
  if (total >= 3600) return formatDuration(total);
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, "0")}`;
}

const LEAD_LABELS = ["moins de 5 s", "5 à 15 s", "15 à 30 s", "30 s à 1 min", "1 à 3 min", "3 min et plus"] as const;

/** The share of the measured time at each forward lead, with its label; buckets never seen are left out. */
export function leadRows({ leadShares }: DeviceEvening): Array<{ label: string; share: number }> {
  return LEAD_BUCKETS.flatMap((_, index) => {
    const share = leadShares[index] ?? 0;
    return share > 0 ? [{ label: LEAD_LABELS[index] ?? "", share }] : [];
  });
}

const switches = (count: number) =>
  count === 0 ? "Aucun changement de qualité" : plural(count, "changement de qualité", "changements de qualité");

const waited = (value: number) =>
  value < 1 ? "N'a pas attendu les autres" : `${shortDuration(value)} à attendre les autres`;

/** « 2 coupures spontanées, 1 juste après un saut » */
const stallCauses = (stallCount: number, afterSeek: number) =>
  `${plural(Math.max(0, stallCount - afterSeek), "coupure spontanée", "coupures spontanées")}, ${afterSeek} juste après un saut`;

/** The finer measures in words; a measure no page of this device took yet is left out. */
export function measureLines(evening: DeviceEvening): string[] {
  const { leadMedian, qualitySwitches, waitSeconds, afterSeekStallCount, stallCount } = evening;
  return [
    leadMedian === null ? null : `Avance médiane : ${shortDuration(leadMedian)} (${playerName(evening.engine)})`,
    qualitySwitches === null ? null : switches(qualitySwitches),
    waitSeconds === null ? null : waited(waitSeconds),
    afterSeekStallCount === null || stallCount === 0 ? null : stallCauses(stallCount, afterSeekStallCount),
  ].filter((line): line is string => line !== null);
}
