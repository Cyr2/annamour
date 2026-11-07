import type { CatalogTitle } from "@annamour/protocol";
import { cx } from "./cx.ts";

const SIZES = {
  small: "h-[54px] w-[36px] rounded-[8px]",
  regular: "h-[72px] w-[48px] rounded-[10px]",
  /** A card in a row of posters (home, TV). */
  card: "aspect-[2/3] w-full rounded-control",
  large: "h-[9.75rem] w-[6.5rem] rounded-control",
} as const;

/** A title's poster, or a soft glow in its place when the catalog has none. Decorative: the title is said next to it. */
export function Poster({ title, size = "regular" }: { title: CatalogTitle; size?: keyof typeof SIZES }) {
  return (
    <div
      aria-hidden
      className={cx("relative shrink-0 overflow-hidden", SIZES[size])}
      style={{ background: "var(--am-poster-glow), var(--am-poster)" }}
    >
      {title.posterUrl ? (
        <img src={title.posterUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : null}
    </div>
  );
}
