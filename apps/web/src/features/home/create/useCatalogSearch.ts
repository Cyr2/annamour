import { CatalogQuery, type CatalogTitle } from "@annamour/protocol";
import { useEffect, useState } from "react";
import { searchCatalog } from "../../../api/catalog.ts";
import { errorMessage } from "../../../api/http.ts";

/** Waits for a pause in typing before searching: one call per word, not per letter. */
export const SEARCH_DEBOUNCE_MS = 350;

export type CatalogSearchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; titles: CatalogTitle[] }
  | { status: "error"; message: string };

/** Searches the catalog as `query` changes; an older answer never replaces a newer one. */
export function useCatalogSearch(query: string): CatalogSearchState {
  const [state, setState] = useState<CatalogSearchState>({ status: "idle" });

  useEffect(() => {
    const parsed = CatalogQuery.safeParse(query);
    if (!parsed.success) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ status: "searching" });
      try {
        const titles = await searchCatalog(parsed.data, controller.signal);
        setState({ status: "done", titles });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: "error", message: errorMessage(error) });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return state;
}
