import { Wordmark } from "./Wordmark.tsx";

/**
 * The wordmark under the last content of a page rather than above the first:
 * the top of the screen goes to what one came for, the name signs the bottom.
 * Held at the foot of the screen while the page is shorter (every screen is a
 * flex column): right under the content, it jumped as the lists and the fonts
 * arrived, the layout shift Lighthouse measured on « Ce soir ».
 */
export function BrandFooter() {
  return (
    <footer className="mt-auto grid place-items-center pt-2 pb-4">
      <Wordmark />
    </footer>
  );
}
