import { FIRST_ROW } from "./PosterCard.tsx";

/** A row and the edge of the next poster, as the shelf shows on a phone. */
const SLOTS = Array.from({ length: FIRST_ROW + 1 }, (_, place) => `place-${place}`);

/**
 * The shelf while the list is on its way: its title and the shapes of a row
 * of posters, the same size as the real ones, so nothing moves when they come.
 */
export function ShelfPlaceholder({ title }: { title: string }) {
  return (
    <section role="status" aria-busy="true" className="grid w-full gap-1 text-left">
      <div className="flex min-h-11 items-center px-1">
        <h2 className="type-heading">{title}</h2>
        <span className="sr-only">Chargement…</span>
      </div>
      <ul aria-hidden className="flex animate-pulse gap-3 overflow-hidden py-3">
        {SLOTS.map((slot) => (
          <li key={slot} className="grid w-[7.5rem] shrink-0 gap-2">
            <span className="aspect-[2/3] w-full rounded-control bg-fill-soft" />
            {/* The two lines under a poster, at their line height (bars drawn inside the padding). */}
            <span className="grid gap-0.5">
              <span className="h-5 w-3/4 rounded-full bg-fill-soft bg-clip-content py-1" />
              <span className="h-4 w-1/2 rounded-full bg-fill-soft bg-clip-content py-0.5" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
