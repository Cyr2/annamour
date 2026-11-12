import {
  type CatalogMediaType,
  type CatalogTitle,
  catalogKey,
  type DismissSuggestionRequest,
  type GroupSuggestion,
  keywordIdf,
  mergeCandidates,
  type Participant,
  preRank,
  type RankedTitle,
  rankForGroup,
  suggestForCircle,
  type TasteCandidate,
  type TitleDetails,
  type TitleDetailsQuery,
  USUAL_AVERAGE,
} from "@annamour/protocol";
import type { Tmdb, TmdbBrief, TmdbTitle } from "../catalog/tmdb.ts";
import { NotFoundError } from "../errors.ts";
import type { DismissalRepository } from "../storage/dismissal-repository.ts";
import type { CatalogService } from "./catalog-service.ts";
import type { CircleService } from "./circle-service.ts";
import type { HistoryService } from "./history-service.ts";
import type { RatingService } from "./rating-service.ts";
import { type CircleSignals, circleSignals } from "./taste-signals.ts";
import {
  discoverPath,
  excludedOf,
  FEW_AVIS,
  keyOf,
  peopleOf,
  reasonsOf,
  seedsOf,
  tasteOf,
  unreleased,
} from "./taste-steps.ts";
import type { WatchlistService } from "./watchlist-service.ts";

/** Suggestions shown. */
const SHOWN = 10;
/** Ranked before checking which Naka has: some will be missing. */
const RANKED = 24;
/** Candidates read in full (keywords, people, saga) after a first cheap sort. */
const SHORTLIST = 40;
/** Naka searches one refresh may make, to stay gentle on it. */
const NAKA_LOOKUPS = 15;
/** A circle's suggestions are kept this long while nothing it said changes. */
const MEMO_MS = 6 * 60 * 60 * 1000;
/** « Pas pour nous » holds this long. */
const DISMISS_MS = 180 * 24 * 60 * 60 * 1000;

export interface TasteServiceOptions {
  tmdb: Tmdb | undefined;
  catalog: CatalogService;
  circles: CircleService;
  watchlist: WatchlistService;
  history: HistoryService;
  ratings: RatingService;
  dismissals: DismissalRepository;
  now: () => number;
}

interface Gathered {
  signals: CircleSignals;
  resolved: Map<string, TmdbTitle>;
  dismissed: { titleKey: string; accountId: string }[];
}

/** « Pour vous ce soir » and a title's details: what TMDB adds to the catalog. */
export class TasteService {
  private readonly options: TasteServiceOptions;
  private readonly memo = new Map<string, { at: number; signature: string; suggestions: GroupSuggestion[] }>();

  constructor(options: TasteServiceOptions) {
    this.options = options;
  }

  /** What TMDB says of a title for its sheet; null without TMDB or when it does not know it. */
  async details(query: TitleDetailsQuery): Promise<TitleDetails | null> {
    const found = await this.tmdbTitle(query);
    if (!found) return null;
    const { tmdbId, overview, tagline, genres, voteAverage, voteCount, runtime, seasons, year } = found;
    return {
      tmdbId,
      genres: genres.map((genre) => genre.name),
      directors: found.directors,
      cast: found.cast,
      ...(overview ? { overview } : {}),
      ...(tagline ? { tagline } : {}),
      ...(voteAverage !== undefined && voteCount ? { voteAverage, voteCount } : {}),
      ...(runtime ? { runtime } : {}),
      ...(seasons ? { seasons } : {}),
      ...(year !== undefined ? { year } : {}),
      ...(found.trailerUrl ? { trailerUrl: found.trailerUrl } : {}),
    };
  }

  /** « Pas pour nous »: the title leaves the circle's suggestions for six months, and tells the taste of who said it. */
  dismiss(accountId: string, circleId: string, { type, tmdbId }: DismissSuggestionRequest): void {
    this.circleOf(accountId, circleId);
    this.options.dismissals.dismiss(circleId, keyOf(type, tmdbId), accountId, this.options.now());
    this.memo.delete(circleId);
  }

  /** What the circle could watch tonight, from its people's tastes (its list only, without TMDB). */
  async forCircle(accountId: string, circleId: string): Promise<GroupSuggestion[]> {
    const circle = this.circleOf(accountId, circleId);
    const signals = this.signalsOf(accountId, circle.id, circle.members);
    const dismissed = this.options.dismissals.since(circleId, this.options.now() - DISMISS_MS);
    if (!this.options.tmdb) return this.fromList(signals);
    const signature = JSON.stringify([
      signals.signals.map((s) => [s.accountId, catalogKey(s.title), s.signal]),
      dismissed.map((d) => d.titleKey),
    ]);
    const kept = this.memo.get(circleId);
    if (kept && kept.signature === signature && this.options.now() - kept.at < MEMO_MS) return kept.suggestions;
    const resolved = await this.resolveAll([
      ...signals.signals.map((s) => s.title),
      ...signals.toWatch.map((i) => i.title),
      ...signals.started,
    ]);
    const suggestions = await this.fromTastes({ signals, resolved, dismissed });
    this.memo.set(circleId, { at: this.options.now(), signature, suggestions });
    return suggestions;
  }

  private circleOf(accountId: string, circleId: string) {
    const circle = this.options.circles.list(accountId).find((candidate) => candidate.id === circleId);
    if (!circle) throw new NotFoundError("Ce cercle n'est pas dans les tiens.");
    return circle;
  }

  private signalsOf(accountId: string, circleId: string, members: Participant[]): CircleSignals {
    const { watchlist, history, ratings } = this.options;
    const items = watchlist.list(accountId).filter((item) => item.circleId === circleId);
    const sessions = history.list(accountId).filter((session) => session.circleId === circleId);
    return circleSignals(members, ratings.byAccounts(members.map((member) => member.accountId)), items, sessions);
  }

  /** Without TMDB: the list's wishes and the avis given, as before. */
  private fromList({ members, toWatch, signals }: CircleSignals): GroupSuggestion[] {
    const ratings = this.options.ratings.byAccounts(members.map((member) => member.accountId));
    const watched = new Set(signals.filter((s) => s.signal === "watched").map((s) => catalogKey(s.title)));
    return suggestForCircle({ members, items: toWatch, ratings, watched }).map(({ title, itemId, reasons }) => ({
      title,
      ...(itemId ? { itemId } : {}),
      perfect: false,
      reasons,
    }));
  }

  private async fromTastes(gathered: Gathered): Promise<GroupSuggestion[]> {
    const { signals, resolved } = gathered;
    const now = this.options.now();
    const dismissedTitles = await this.dismissedTitles(gathered.dismissed);
    const excluded = excludedOf(
      signals,
      resolved,
      gathered.dismissed.map((d) => d.titleKey),
    );
    const roughPeople = peopleOf(signals, resolved, dismissedTitles, new Map(), now);
    const rough = await this.roughCandidates(gathered, roughPeople);
    const shortlist = preRank(roughPeople, rough.candidates, excluded, SHORTLIST);
    const full = await this.readInFull(shortlist, resolved);
    const candidates = full.filter((c) => !unreleased(c.details ?? {}, now)).map((c) => c.candidate);
    const idf = keywordIdf([...[...resolved.values()].map(tasteOf), ...candidates.map((c) => c.title)]);
    const people = peopleOf(signals, resolved, dismissedTitles, idf, now);
    const averages = candidates.flatMap((c) => c.title.voteAverage ?? []);
    const usualAverage = averages.length ? averages.reduce((a, b) => a + b, 0) / averages.length : USUAL_AVERAGE;
    const ranked = rankForGroup(people, candidates, excluded, RANKED, { idf, usualAverage });
    const details = new Map(full.flatMap((c) => (c.details ? [[c.candidate.title.key, c.details] as const] : [])));
    return this.available(ranked, gathered, { details, briefs: rough.briefs }, candidates);
  }

  private async dismissedTitles(dismissed: Gathered["dismissed"]) {
    const { tmdb } = this.options;
    if (!tmdb) return [];
    const found = await Promise.all(
      dismissed.map(async ({ titleKey, accountId }) => {
        const [type, id] = titleKey.split(":");
        const title = type === "movie" || type === "tv" ? await tmdb.title(type, Number(id)) : null;
        return title ? [{ title, accountId }] : [];
      }),
    );
    return found.flat();
  }

  /** The list, the titles loved by some, TMDB's recommendations from the favourites, and a « discover » on the group's taste. */
  private async roughCandidates(
    gathered: Gathered,
    people: Parameters<typeof discoverPath>[0],
  ): Promise<{ candidates: TasteCandidate[]; briefs: Map<string, TmdbBrief> }> {
    const { signals, resolved } = gathered;
    const listed = signals.toWatch.flatMap((item) => {
      const found = resolved.get(catalogKey(item.title));
      return found ? [{ title: tasteOf(found), seeds: [], wantedBy: item.wantedBy }] : [];
    });
    // Loved or liked by some of them elsewhere: worth watching with the others.
    const lovedElsewhere = signals.signals.flatMap(({ title, signal }) => {
      const found = signal === "loved" || signal === "liked" ? resolved.get(catalogKey(title)) : undefined;
      return found ? [{ title: tasteOf(found), seeds: [], wantedBy: [] }] : [];
    });
    const seeds = seedsOf(signals, resolved);
    const recommended = seeds.flatMap(({ title, weight }) =>
      title.recommendations.map((brief) => ({
        title: tasteOf(brief),
        seeds: [{ key: keyOf(title.type, title.tmdbId), weight }],
        wantedBy: [],
      })),
    );
    const found = await this.discovered(signals, people);
    const discovered = found.map((brief) => ({ title: tasteOf(brief), seeds: [], wantedBy: [] }));
    // Their posters and ratings, for the titles whose full details are not read.
    const briefs = new Map(
      [...seeds.flatMap(({ title }) => title.recommendations), ...found].map((b) => [keyOf(b.type, b.tmdbId), b]),
    );
    return { candidates: mergeCandidates([...listed, ...lovedElsewhere, ...recommended, ...discovered]), briefs };
  }

  /** « Discover » on the group's taste; for a circle that said little yet, the best rated and the trending. */
  private async discovered(signals: CircleSignals, people: Parameters<typeof discoverPath>[0]): Promise<TmdbBrief[]> {
    const { tmdb } = this.options;
    if (!tmdb) return [];
    const avis = signals.signals.filter((s) => ["loved", "liked", "meh", "disliked"].includes(s.signal)).length;
    const kinds: CatalogMediaType[] = signals.signals.some((s) => s.title.type === "tv") ? ["movie", "tv"] : ["movie"];
    const paths = kinds.flatMap((kind) => discoverPath(people, kind) ?? []);
    if (avis < FEW_AVIS) paths.push("movie/top_rated", "trending/all/week");
    const lists = await Promise.all(paths.map((path) => tmdb.list(path, path.includes("/tv") ? "tv" : "movie")));
    return lists.flat();
  }

  /** The shortlist read in full from TMDB: keywords, people, saga, release date. */
  private async readInFull(shortlist: readonly TasteCandidate[], resolved: ReadonlyMap<string, TmdbTitle>) {
    const byKey = new Map([...resolved.values()].map((title) => [keyOf(title.type, title.tmdbId), title]));
    return Promise.all(
      shortlist.map(async (candidate) => {
        const [type, id] = candidate.title.key.split(":");
        const known = byKey.get(candidate.title.key);
        const details =
          known ??
          (type === "movie" || type === "tv" ? await this.options.tmdb?.title(type, Number(id)) : null) ??
          undefined;
        return { candidate: details ? { ...candidate, title: tasteOf(details) } : candidate, details };
      }),
    );
  }

  /** TMDB's details of every title the circle spoke of, by the catalog's key. */
  private async resolveAll(titles: readonly CatalogTitle[]): Promise<Map<string, TmdbTitle>> {
    const unique = new Map(titles.map((title) => [catalogKey(title), title]));
    const entries = await Promise.all(
      [...unique].map(async ([key, title]) => [key, await this.tmdbTitle(title)] as const),
    );
    return new Map(entries.flatMap(([key, found]) => (found ? [[key, found]] : [])));
  }

  private async tmdbTitle(title: Pick<CatalogTitle, "type" | "title" | "year" | "tmdbId">): Promise<TmdbTitle | null> {
    const { tmdb } = this.options;
    if (!tmdb) return null;
    const tmdbId = title.tmdbId ?? (await tmdb.find(title.type, title.title, title.year));
    return tmdbId === null ? null : tmdb.title(title.type, tmdbId);
  }

  /** The ranked titles Naka has, with their catalog title and why they are there. */
  private async available(
    ranked: readonly RankedTitle[],
    { signals, resolved }: Gathered,
    { details, briefs }: { details: ReadonlyMap<string, TmdbTitle>; briefs: ReadonlyMap<string, TmdbBrief> },
    candidates: readonly TasteCandidate[],
  ): Promise<GroupSuggestion[]> {
    const listed = new Map(
      signals.toWatch.flatMap((item) => {
        const found = resolved.get(catalogKey(item.title));
        return found ? [[keyOf(found.type, found.tmdbId), item] as const] : [];
      }),
    );
    const suggestions: GroupSuggestion[] = [];
    const naka = { lookupsLeft: NAKA_LOOKUPS };
    for (const entry of ranked) {
      if (suggestions.length >= SHOWN) break;
      const item = listed.get(entry.key);
      const full = details.get(entry.key);
      const brief = full ?? briefs.get(entry.key);
      const title = item?.title ?? (await this.onNaka(brief, naka));
      if (!title) continue;
      const wantedBy = candidates.find((c) => c.title.key === entry.key)?.wantedBy ?? [];
      suggestions.push({
        title: { ...title, ...(brief?.posterUrl && !title.posterUrl ? { posterUrl: brief.posterUrl } : {}) },
        ...(item ? { itemId: item.id } : {}),
        perfect: entry.perfect,
        reasons: reasonsOf(entry, {
          members: signals.members,
          signals: signals.signals,
          resolved,
          full,
          brief,
          wantedBy,
        }),
      });
    }
    return suggestions;
  }

  /** The catalog's title for a TMDB one, within the refresh's budget of Naka searches. */
  private async onNaka(brief: TmdbBrief | undefined, naka: { lookupsLeft: number }): Promise<CatalogTitle | null> {
    if (!brief || naka.lookupsLeft <= 0) return null;
    naka.lookupsLeft--;
    return this.options.catalog.titleFor(brief);
  }
}
