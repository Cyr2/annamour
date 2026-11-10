import type { CatalogTitle } from "@annamour/protocol";
import { cx } from "./cx.ts";

const SIZES = {
  small: "h-[54px] w-[36px] rounded-[8px]",
  regular: "h-[72px] w-[48px] rounded-[10px]",
  /** A card in a row of posters (home, TV). */
  card: "aspect-[2/3] w-full rounded-control",
  large: "h-[9.75rem] w-[6.5rem] rounded-control",
  /** Regular on a phone, large from a tablet up, where a small poster was lost in a wide card. */
  feature: "h-[72px] w-[48px] rounded-[10px] sm:h-[9.75rem] sm:w-[6.5rem] sm:rounded-control",
} as const;

interface PosterProps {
  title: CatalogTitle;
  size?: keyof typeof SIZES;
  /**
   * On screen as the page opens: fetched at once and first. A lazy image is
   * only asked for once laid out, which kept the first row of posters, the
   * page's largest paint, waiting.
   */
  priority?: boolean;
}

/** A title's poster, or a soft glow in its place when the catalog has none. Decorative: the title is said next to it. */
export function Poster({ title, size = "regular", priority = false }: PosterProps) {
  return (
    <div
      aria-hidden
      className={cx("relative shrink-0 overflow-hidden", SIZES[size])}
      style={{ background: "var(--am-poster-glow), var(--am-poster)" }}
    >
      {title.posterUrl ? (
        <img
          src={title.posterUrl}
          alt=""
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className="size-full object-cover"
        />
      ) : null}
    </div>
  );
}
