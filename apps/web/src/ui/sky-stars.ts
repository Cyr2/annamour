/** The starry sky's stars: drawn once from a fixed seed, so every screen and every visit shows the same sky. */

export interface Star {
  /** Position, in % of the sky's width and height. */
  x: number;
  y: number;
  /** Radius in px. */
  r: number;
  /** Resting brightness, 0 to 1. */
  o: number;
  /** A few stars carry a soft halo. */
  bright: boolean;
  /** Which twinkle layer it belongs to (each layer breathes at its own pace). */
  layer: number;
}

export const STAR_COUNT = 96;
export const TWINKLE_LAYERS = 3;
/** Stars sit in the top 70 % of the sky, above the hills. */
const SKY_DEPTH = 70;

/** mulberry32: a tiny deterministic generator. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const svgImage = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'>${body}</svg>`)}")`;

const at = (star: Star) => `cx='${star.x.toFixed(2)}%' cy='${star.y.toFixed(2)}%'`;

/**
 * A layer of stars as one image, used as a mask over the star colour (a
 * token): the browser paints it once, and the layer only fades. `halo` draws
 * the soft glows of the bright stars instead of the stars themselves.
 */
export function starMask(stars: readonly Star[], halo = false): string {
  if (halo) {
    const glows = stars
      .filter((star) => star.bright)
      .map(
        (star) => `<circle ${at(star)} r='${(star.r * 4).toFixed(1)}' fill='url(#h)' opacity='${star.o.toFixed(2)}'/>`,
      )
      .join("");
    return svgImage(
      `<defs><radialGradient id='h'><stop offset='0'/><stop offset='1' stop-opacity='0'/></radialGradient></defs>${glows}`,
    );
  }
  return svgImage(
    stars.map((star) => `<circle ${at(star)} r='${star.r.toFixed(2)}' fill-opacity='${star.o.toFixed(2)}'/>`).join(""),
  );
}

/** Denser and brighter towards the top; about one star in ten is bright. */
export function makeStars(seed = 2026, count = STAR_COUNT): Star[] {
  const random = seeded(seed);
  const between = (a: number, b: number) => a + random() * (b - a);
  return Array.from({ length: count }, (_, i) => {
    const y = random() ** 1.6 * SKY_DEPTH;
    const bright = random() < 0.1;
    return {
      x: between(1, 99),
      y,
      r: bright ? between(1.3, 1.8) : between(0.45, 1.05),
      o: between(0.35, 1) * (1 - y / 110),
      bright,
      layer: i % TWINKLE_LAYERS,
    };
  });
}
