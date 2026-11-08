import { Wordmark } from "./Wordmark.tsx";

/**
 * The wordmark under the last content of a page rather than above the first:
 * the top of the screen goes to what one came for, the name signs the bottom.
 */
export function BrandFooter() {
  return (
    <footer className="grid place-items-center pt-2 pb-4">
      <Wordmark />
    </footer>
  );
}
