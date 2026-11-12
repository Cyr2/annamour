import {
  type CatalogMediaType,
  type CatalogTitle,
  catalogKey,
  type GroupSuggestion,
  mergeCandidates,
  type Participant,
  type RankedTitle,
  rankForGroup,
  type SuggestionWhy,
  suggestForCircle,
  type TasteCandidate,
  type TastePerson,
  type TasteTitle,
  type TitleDetails,
  type TitleDetailsQuery,
  tasteProfile,
} from "@annamour/protocol";
import type { Tmdb, TmdbBrief, TmdbTitle } from "../catalog/tmdb.ts";
import { TMDB_GENRES } from "../catalog/tmdb-genres.ts";
import { NotFoundError } from "../errors.ts";
import type { CatalogService } from "./catalog-service.ts";
import type { CircleService } from "./circle-service.ts";
import type { HistoryService } from "./history-service.ts";
import type { RatingService } from "./rating-service.ts";
import { type CircleSignals, circleSignals } from "./taste-signals.ts";
import type { WatchlistService } from "./watchlist-service.ts";

/** Suggestions shown. */
const SHOWN = 10;
/** Ranked before checking which Naka has: some will be missing. */
const RANKED = 24;
/** Naka searches one refresh may make, to stay gentle on it. */
const NAKA_LOOKUPS = 14;
/** Titles whose TMDB recommendations feed the candidates, the most loved first. */
const SEEDS = 15;
/** A circle's suggestions are kept this long while nothing it said changes. */
const MEMO_MS = 30 * 60 * 1000;
const ACCLAIMED = { average: 7.5, votes: 500 } as const;
const SEED_STRENGTH: Record<string, number> = { loved: 3, liked: 2, wants: 1 };

export interface TasteServiceOptions {
  tmdb: Tmdb | undefined;
  catalog: CatalogService;
  circles: CircleService;
  watchlist: WatchlistService;
  history: HistoryService;
  ratings: RatingService;
  now: () => number;
}

const keyOf = (type: CatalogMediaType, tmdbId: number) => `${type}:${tmdbId}`;
const tasteOf = (title: TmdbBrief): TasteTitle => ({
  key: keyOf(title.type, title.tmdbId),
  genres: title.genreIds,
  ...(title.language ? { language: title.language } : {}),
  ...(title.year !== undefined ? { year: title.year } : {}),
  ...(title.voteAverage !== undefined ? { voteAverage: title.voteAverage } : {}),
  ...(title.voteCount !== undefined ? { voteCount: title.voteCount } : {}),
});

/** TMDB's key of a title the circle spoke of, once resolved. */
function tmdbKeyOf(title: CatalogTitle, resolved: ReadonlyMap<string, TmdbTitle>): string | undefined {
  const found = resolved.get(catalogKey(title));
  return found ? keyOf(found.type, found.tmdbId) : undefined;
}

/**
 * Left out: what the circle watched together, what someone did not like or
 * found bof, and what everyone already gave an avis on. A title only some of
 * them saw (and liked) stays: it is a fine idea for the others.
 */
function excludedOf(signals: CircleSignals, resolved: ReadonlyMap<string, TmdbTitle>): Set<string> {
  const excluded = new Set<string>();
  const raters = new Map<string, Set<string>>();
  for (const { accountId, title, signal } of signals.signals) {
    const key = tmdbKeyOf(title, resolved);
    if (!key || signal === "wants") continue;
    if (signal === "watched" || signal === "disliked" || signal === "meh") excluded.add(key);
    else raters.set(key, (raters.get(key) ?? new Set()).add(accountId));
  }
  for (const [key, people] of raters) if (people.size >= signals.members.length) excluded.add(key);
  return excluded;
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

  /** What the circle could watch tonight, from its people's tastes (its list only, without TMDB). */
  async forCircle(accountId: string, circleId: string): Promise<GroupSuggestion[]> {
    const circle = this.options.circles.list(accountId).find((candidate) => candidate.id === circleId);
    if (!circle) throw new NotFoundError("Ce cercle n'est pas dans les tiens.");
    const signals = this.signalsOf(accountId, circle.id, circle.members);
    if (!this.options.tmdb) return this.fromList(signals);
    const signature = JSON.stringify(signals.signals.map((s) => [s.accountId, catalogKey(s.title), s.signal]));
    const kept = this.memo.get(circleId);
    if (kept && kept.signature === signature && this.options.now() - kept.at < MEMO_MS) return kept.suggestions;
    const suggestions = await this.fromTastes(signals);
    this.memo.set(circleId, { at: this.options.now(), signature, suggestions });
    return suggestions;
  }

  private signalsOf(accountId: string, circleId: string, members: Participant[]): CircleSignals {
    const { watchlist, history, ratings } = this.options;
    const items = watchlist.list(accountId).filter((item) => item.circleId === circleId);
    const sessions = history.list(accountId).filter((session) => session.circleId === circleId);
    const memberRatings = ratings.byAccounts(members.map((member) => member.accountId));
    return circleSignals(members, memberRatings, items, sessions);
  }

  /** Without TMDB: the list's wishes and the avis given, as before. */
  private fromList({ members, toWatch, signals }: CircleSignals): GroupSuggestion[] {
    const ratings = this.options.ratings.byAccounts(members.map((member) => member.accountId));
    const watched = new Set(signals.filter((s) => s.signal === "watched").map((s) => catalogKey(s.title)));
    return suggestForCircle({ members, items: toWatch, ratings, watched }).map(({ title, itemId, reasons }) => ({
      title,
      ...(itemId ? { itemId } : {}),
      matches: [],
      reasons,
    }));
  }

  private async fromTastes(signals: CircleSignals): Promise<GroupSuggestion[]> {
    const resolved = await this.resolveAll([
      ...signals.signals.map((s) => s.title),
      ...signals.toWatch.map((i) => i.title),
    ]);
    const people: TastePerson[] = signals.members.map((member) => ({
      accountId: member.accountId,
      profile: tasteProfile(
        signals.signals.flatMap((s) => {
          const found = resolved.get(catalogKey(s.title));
          return s.accountId === member.accountId && found ? [{ title: tasteOf(found), signal: s.signal }] : [];
        }),
      ),
    }));
    const candidates = this.candidatesOf(signals, resolved);
    const ranked = rankForGroup(people, candidates, excludedOf(signals, resolved), RANKED);
    return this.available(ranked, signals, resolved, candidates);
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

  /** The circle's list, and what TMDB recommends from the titles its people loved, liked or want. */
  private candidatesOf(signals: CircleSignals, resolved: Map<string, TmdbTitle>): TasteCandidate[] {
    const strength = new Map<string, number>();
    for (const { title, signal } of signals.signals) {
      const key = catalogKey(title);
      strength.set(key, (strength.get(key) ?? 0) + (SEED_STRENGTH[signal] ?? 0));
    }
    const seeds = [...strength]
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, SEEDS)
      .flatMap(([key]) => resolved.get(key) ?? []);
    const recommended = seeds.flatMap((seed) =>
      seed.recommendations.map((brief) => ({
        title: tasteOf(brief),
        seeds: [keyOf(seed.type, seed.tmdbId)],
        wantedBy: [],
      })),
    );
    const listed = signals.toWatch.flatMap((item) => {
      const found = resolved.get(catalogKey(item.title));
      return found ? [{ title: tasteOf(found), seeds: [], wantedBy: item.wantedBy }] : [];
    });
    // Loved or liked by some of them elsewhere: worth watching again, with the others.
    const lovedElsewhere = signals.signals.flatMap(({ title, signal }) => {
      const found = signal === "loved" || signal === "liked" ? resolved.get(catalogKey(title)) : undefined;
      return found ? [{ title: tasteOf(found), seeds: [], wantedBy: [] }] : [];
    });
    return mergeCandidates([...listed, ...lovedElsewhere, ...recommended]);
  }

  /** The ranked titles Naka has, with their catalog title and why they are there. */
  private async available(
    ranked: readonly RankedTitle[],
    signals: CircleSignals,
    resolved: Map<string, TmdbTitle>,
    candidates: readonly TasteCandidate[],
  ): Promise<GroupSuggestion[]> {
    const briefs = this.briefsByKey(resolved);
    const listed = new Map(
      signals.toWatch.flatMap((item) => {
        const found = resolved.get(catalogKey(item.title));
        return found ? [[keyOf(found.type, found.tmdbId), item] as const] : [];
      }),
    );
    const suggestions: GroupSuggestion[] = [];
    let lookups = 0;
    for (const entry of ranked) {
      if (suggestions.length >= SHOWN) break;
      const item = listed.get(entry.key);
      const brief = briefs.get(entry.key);
      if (!item && (!brief || lookups >= NAKA_LOOKUPS)) continue;
      if (!item) lookups++;
      const title = item?.title ?? (brief ? await this.options.catalog.titleFor(brief) : null);
      if (!title) continue;
      const wantedBy = candidates.find((c) => c.title.key === entry.key)?.wantedBy ?? [];
      suggestions.push({
        title: { ...title, ...(brief?.posterUrl && !title.posterUrl ? { posterUrl: brief.posterUrl } : {}) },
        ...(item ? { itemId: item.id } : {}),
        matches: entry.matches.flatMap(({ accountId, match }) => {
          const by = signals.members.find((member) => member.accountId === accountId);
          return by ? [{ by, match }] : [];
        }),
        reasons: this.reasonsOf(entry, brief, resolved, signals, wantedBy),
      });
    }
    return suggestions;
  }

  private briefsByKey(resolved: Map<string, TmdbTitle>): Map<string, TmdbBrief> {
    const briefs = new Map<string, TmdbBrief>();
    for (const title of resolved.values()) {
      briefs.set(keyOf(title.type, title.tmdbId), title);
      for (const brief of title.recommendations) briefs.set(keyOf(brief.type, brief.tmdbId), brief);
    }
    return briefs;
  }

  private reasonsOf(
    entry: RankedTitle,
    brief: TmdbBrief | undefined,
    resolved: Map<string, TmdbTitle>,
    { members, signals }: CircleSignals,
    wantedBy: readonly string[],
  ): SuggestionWhy[] {
    const reasons: SuggestionWhy[] = [];
    const wanting = members.filter((member) => wantedBy.includes(member.accountId));
    if (wanting.length) reasons.push({ kind: "wants", people: wanting });
    for (const kind of ["loved", "liked"] as const) {
      const ids = signals
        .filter((s) => s.signal === kind && tmdbKeyOf(s.title, resolved) === entry.key)
        .map((s) => s.accountId);
      const people = members.filter((member) => ids.includes(member.accountId));
      if (people.length) reasons.push({ kind, people });
    }
    const byKey = new Map([...resolved.values()].map((title) => [keyOf(title.type, title.tmdbId), title.title]));
    const seedTitles = entry.seeds.flatMap((seed) => byKey.get(seed) ?? []).slice(0, 2);
    if (seedTitles.length) reasons.push({ kind: "because", titles: seedTitles });
    const genres = [...new Set(entry.sharedGenres.flatMap((id) => TMDB_GENRES[id] ?? []))].slice(0, 2);
    if (genres.length) reasons.push({ kind: "genres", genres });
    const average = brief?.voteAverage;
    if (average !== undefined && average >= ACCLAIMED.average && (brief?.voteCount ?? 0) >= ACCLAIMED.votes)
      reasons.push({ kind: "acclaimed", voteAverage: Math.round(average * 10) / 10 });
    return reasons;
  }
}
