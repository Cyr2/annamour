import type { DeviceEvening } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import {
  deviceTitle,
  headline,
  heightLabel,
  leadRows,
  measureLines,
  shortDuration,
  targetLines,
} from "./report-lines.ts";

const evening = (overrides: Partial<DeviceEvening> = {}): DeviceEvening => ({
  name: "Anna",
  device: "iPad",
  engine: "native",
  watchedSeconds: 777.5,
  stallCount: 2,
  stallSeconds: 46.9,
  heights: [
    { height: 234, share: 0.317 },
    { height: 360, share: 0.27 },
    { height: 480, share: 0.413 },
  ],
  leadShares: [0.1, 0, 0, 0, 0.4, 0.5],
  leadMedian: 130,
  qualitySwitches: 4,
  waitSeconds: 65,
  afterSeekStallCount: 1,
  targets: {
    rebuffer: { value: 0.0569, met: false },
    stalls: { value: 6.2, met: false },
    stallLength: { value: 23.45, met: false },
    lowest: { value: 0.317, met: false },
    startup: { value: 1235, met: true },
  },
  ...overrides,
});

describe("the séance's quality, in words", () => {
  it("names the person, the device and the player", () => {
    expect(deviceTitle(evening())).toBe("Anna · iPad (lecteur Safari)");
    expect(deviceTitle(evening({ engine: "hls.js" }))).toBe("Anna · iPad (lecteur Annamour)");
  });

  it("sums the evening up in a sentence", () => {
    expect(headline(evening())).toBe("2 coupures (47 s), 5,7 % du temps bloqué, 32 % en 234p · 13 min regardé");
  });

  it("says when nothing froze, and never saw the lightest quality", () => {
    const smooth = evening({
      stallCount: 0,
      stallSeconds: 0,
      heights: [{ height: 640, share: 1 }],
      targets: { ...evening().targets, rebuffer: { value: 0, met: true } },
    });
    expect(headline(smooth)).toMatch(/^aucune coupure, 0 % du temps bloqué, 0 % en 234p/);
  });

  it("lists each target with the evening's value and whether it was met", () => {
    const lines = targetLines(evening());
    expect(lines.map((line) => `${line.label} : ${line.value} — ${line.goal}`)).toEqual([
      "Temps bloqué : 5,7 % — moins de 1 %",
      "Coupures par épisode : 6,2 — 1 au plus",
      "Durée d'une coupure : 23 s — moins de 5 s",
      "Temps en 234p : 32 % — moins de 10 %",
      "Démarrage : 1,2 s — moins de 2 s",
    ]);
    expect(lines.map((line) => line.met)).toEqual([false, false, false, false, true]);
  });

  it("says what is not measured yet", () => {
    const fresh = evening({ targets: { ...evening().targets, startup: { value: null, met: null } } });
    expect(targetLines(fresh).at(-1)).toMatchObject({ value: "pas encore mesuré", met: null });
  });

  it("tells the finer measures in plain words", () => {
    expect(measureLines(evening({ engine: "hls.js" }))).toEqual([
      "Avance médiane : 2 min 10 (lecteur Annamour)",
      "4 changements de qualité",
      "1 min 05 à attendre les autres",
      "1 coupure spontanée, 1 juste après un saut",
    ]);
    expect(
      measureLines(
        evening({ leadMedian: 3.4, qualitySwitches: 0, waitSeconds: 0, stallCount: 3, afterSeekStallCount: 0 }),
      ),
    ).toEqual([
      "Avance médiane : 3 s (lecteur Safari)",
      "Aucun changement de qualité",
      "N'a pas attendu les autres",
      "3 coupures spontanées, 0 juste après un saut",
    ]);
  });

  it("leaves out what older pages did not measure, and the causes when nothing froze", () => {
    const old = evening({ leadShares: [], leadMedian: null, qualitySwitches: null, waitSeconds: null });
    expect(measureLines(old)).toEqual(["1 coupure spontanée, 1 juste après un saut"]);
    expect(measureLines(evening({ ...old, stallCount: 0 }))).toEqual([]);
    expect(leadRows(old)).toEqual([]);
  });

  it("names the lead buckets and skips those never seen", () => {
    expect(leadRows(evening())).toEqual([
      { label: "moins de 5 s", share: 0.1 },
      { label: "1 à 3 min", share: 0.4 },
      { label: "3 min et plus", share: 0.5 },
    ]);
  });

  it("writes short durations as people say them", () => {
    expect([0, 45, 60, 130, 3725].map(shortDuration)).toEqual(["0 s", "45 s", "1 min 00", "2 min 10", "1 h 02"]);
  });

  it("names the qualities as people know them", () => {
    expect(heightLabel(234)).toBe("234p");
    expect(heightLabel(640)).toBe("Qualité d'origine");
  });
});
