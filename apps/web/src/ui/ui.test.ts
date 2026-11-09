import { describe, expect, it } from "vitest";
import { progressFill } from "./progress-fill.ts";
import { makeStars, STAR_COUNT, starMask, TWINKLE_LAYERS } from "./sky-stars.ts";
import { knotPoint, threadPath } from "./thread-path.ts";

describe("red thread geometry", () => {
  const root = { left: 100, top: 50, width: 360, height: 140 };

  it("ties onto the bubble's centre, not the centre of bubble and caption", () => {
    // An 84px bubble at the top of an anchor that is 140px tall with its caption.
    const bubble = { left: 120, top: 50, width: 84, height: 84 };
    expect(knotPoint(root, bubble, { width: 84, height: 84 })).toEqual({ x: 62, y: 42, r: 42 });
  });

  it("keeps the layout radius while a bubble is still scaling in", () => {
    const scaled = { left: 136.8, top: 66.8, width: 50.4, height: 50.4 };
    expect(knotPoint(root, scaled, { width: 84, height: 84 })).toEqual({ x: 62, y: 42, r: 42 });
  });

  it("draws a taut thread straight from rim to rim", () => {
    const d = threadPath(
      [
        { x: 62, y: 42, r: 42 },
        { x: 298, y: 42, r: 42 },
      ],
      0,
      0,
      0,
    );
    expect(d.startsWith("M104.0 42.0")).toBe(true);
    expect(d.endsWith("L256.0 42.0")).toBe(true);
  });
});

describe("starry sky", () => {
  it("draws the same sky every time", () => {
    expect(makeStars()).toEqual(makeStars());
    expect(makeStars(1)).not.toEqual(makeStars(2));
  });

  it("spreads its stars over the layers, above the hills, denser near the top", () => {
    const stars = makeStars();
    expect(stars).toHaveLength(STAR_COUNT);
    expect(new Set(stars.map((s) => s.layer)).size).toBe(TWINKLE_LAYERS);
    expect(stars.every((s) => s.y >= 0 && s.y <= 70 && s.o > 0 && s.o <= 1)).toBe(true);
    const top = stars.filter((s) => s.y < 35).length;
    expect(top).toBeGreaterThan(stars.length - top);
    expect(stars.some((s) => s.bright)).toBe(true);
  });

  it("draws a layer as one SVG image: a circle per star, or a glow per bright star", () => {
    const stars = makeStars();
    const decode = (mask: string) => decodeURIComponent(mask.slice('url("data:image/svg+xml,'.length, -2));
    expect(decode(starMask(stars)).match(/<circle /g)).toHaveLength(stars.length);
    expect(decode(starMask(stars, true)).match(/<circle /g)).toHaveLength(stars.filter((s) => s.bright).length);
    expect(decode(starMask(stars, true))).toContain("radialGradient");
  });
});

describe("a progress bar", () => {
  it("fills in the thread colour while under way, in mint once watched to the end, like the episode bars", () => {
    expect(progressFill(false)).toBe("bg-thread");
    expect(progressFill(true)).toBe("bg-success");
  });
});
