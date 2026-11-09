/**
 * « On regarde ? » while the list and the séances are on their way: the shape
 * of a title (poster, lines, button) rather than « Rien de prévu », which
 * showed for a moment before the real pick on every launch.
 */
export function PickPlaceholder() {
  return (
    <div role="status" aria-busy="true" className="grid animate-pulse gap-4">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden className="flex gap-4">
        {/* The regular poster's size (ui/Poster.tsx). */}
        <div className="h-18 w-12 shrink-0 rounded-[10px] bg-fill-soft" />
        <div className="grid flex-1 content-center gap-2">
          <div className="h-3 w-24 rounded-full bg-fill-soft" />
          <div className="h-5 w-3/4 rounded-full bg-fill-soft" />
          <div className="h-3 w-1/2 rounded-full bg-fill-soft" />
        </div>
      </div>
      {/* A large button's height (52px). */}
      <div aria-hidden className="h-13 rounded-pill bg-fill-soft" />
    </div>
  );
}
