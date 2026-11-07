import type { CSSProperties } from "react";
import { makeStars, starMask, TWINKLE_LAYERS } from "./sky-stars.ts";

const STARS = makeStars();
/** Each layer is one mask image, built once: three layers of stars, then the bright stars' glows. */
const MASKS = [
  ...Array.from({ length: TWINKLE_LAYERS }, (_, layer) => starMask(STARS.filter((star) => star.layer === layer))),
  starMask(STARS, true),
];

/**
 * « Le ciel étoilé »: the backdrop behind every screen. A dusk sky from the
 * night blue of the logo down to rose at the horizon, a faint milky way,
 * stars that twinkle, now and then a shooting star, and dark hills.
 *
 * Built to cost nothing on a phone: the stars are drawn once (a fixed seed)
 * into four mask images over the star colour, and each layer only fades its
 * opacity; the shooting star only moves. No filter, no blend, no repaint
 * while it animates. Still under reduced motion; hidden while the film plays.
 */
export function Ambient() {
  return (
    <div aria-hidden className="am-ambient">
      <div className="am-sky-milky" />
      {MASKS.map((mask, layer) => (
        <div
          key={mask}
          className="am-sky-stars"
          data-layer={layer === TWINKLE_LAYERS ? "halo" : layer}
          style={{ "--am-stars": mask } as CSSProperties}
        />
      ))}
      <div className="am-sky-shooting" />
      <div className="am-sky-hills" />
    </div>
  );
}
