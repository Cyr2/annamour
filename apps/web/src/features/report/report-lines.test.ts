import type { DeviceEvening } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { deviceTitle, headline, heightLabel, targetLines } from "./report-lines.ts";

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

  it("names the qualities as people know them", () => {
    expect(heightLabel(234)).toBe("234p");
    expect(heightLabel(640)).toBe("Qualité d'origine");
  });
});
