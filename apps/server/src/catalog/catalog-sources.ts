import type {
  CatalogSeasonQuery,
  CatalogSeasonResponse,
  CatalogSource,
  CatalogTitle,
  PlayCatalogRequest,
} from "@annamour/protocol";
import { CatalogUnavailableError } from "../errors.ts";
import type { Catalog } from "./naka-catalog.ts";

/** A source slower than this is left out of a search: the other one's titles come without waiting. */
export const SOURCE_SEARCH_TIMEOUT_MS = 30_000;

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("source too slow")), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Naka and Nakanime as one catalog: a search asks both at once and shows
 * what each found, Naka's first; the rest goes to the title's own source
 * (Naka when a title, kept from before, does not say).
 */
export class CatalogSources implements Catalog {
  private readonly sources: Partial<Record<CatalogSource, Catalog>>;
  private readonly timeoutMs: number;

  constructor(sources: Partial<Record<CatalogSource, Catalog>>, timeoutMs = SOURCE_SEARCH_TIMEOUT_MS) {
    this.sources = sources;
    this.timeoutMs = timeoutMs;
  }

  /** Whether any source is set up. */
  get any(): boolean {
    return Object.values(this.sources).some(Boolean);
  }

  /** Each source's titles; one that fails or is too slow is left out, unless all do. */
  async search(query: string): Promise<CatalogTitle[]> {
    const catalogs = Object.values(this.sources).filter((catalog) => catalog !== undefined);
    const answers = await Promise.allSettled(catalogs.map((c) => withTimeout(c.search(query), this.timeoutMs)));
    const found = answers.flatMap((answer) => (answer.status === "fulfilled" ? [answer.value] : []));
    const failure = answers.find((answer) => answer.status === "rejected");
    if (found.length === 0 && failure) throw failure.reason;
    return found.flat();
  }

  async season(id: number, season: number, query: CatalogSeasonQuery = {}): Promise<CatalogSeasonResponse> {
    return this.source(query.source).season(id, season, query);
  }

  async videoUrl(request: PlayCatalogRequest): Promise<URL> {
    return this.source(request.source).videoUrl(request);
  }

  private source(name: CatalogSource = "naka"): Catalog {
    const catalog = this.sources[name];
    if (!catalog) throw new CatalogUnavailableError();
    return catalog;
  }
}
