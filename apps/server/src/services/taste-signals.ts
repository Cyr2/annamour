import {
  type CatalogTitle,
  type Participant,
  type SessionSummary,
  seanceFinished,
  type TasteSignal,
  type TitleRating,
  type WatchlistItem,
} from "@annamour/protocol";

/** Something one person of the circle said of a title, or did with it, and when (when known). */
export interface PersonSignal {
  accountId: string;
  title: CatalogTitle;
  signal: TasteSignal;
  at?: number;
}

/** What a circle's people said and did, read from their avis, their list and their séances. */
export interface CircleSignals {
  members: Participant[];
  signals: PersonSignal[];
  /** The circle's list, still to watch. */
  toWatch: WatchlistItem[];
  /** Titles the circle is done with: watched together, or marked watched in its list. */
  seen: CatalogTitle[];
  /** Series the circle has under way: « Reprendre » offers them already. */
  started: CatalogTitle[];
}

/** A séance's title, as the catalog named it (series by their name, films by theirs). */
function seanceTitle(session: SessionSummary): CatalogTitle | undefined {
  if (!session.catalog) return undefined;
  const playing = session.queue?.[session.episode.index];
  const title = playing?.type === "movie" ? playing.title : session.title;
  return { ...session.catalog, title };
}

const isFinished = (session: SessionSummary) =>
  seanceFinished({
    position: session.position,
    duration: session.duration,
    index: session.episode.index,
    count: session.episode.count,
  });

export function circleSignals(
  members: Participant[],
  ratings: readonly TitleRating[],
  circleItems: readonly WatchlistItem[],
  circleSessions: readonly SessionSummary[],
): CircleSignals {
  const signals: PersonSignal[] = ratings.map(({ by, title, rating, ratedAt }) => ({
    accountId: by.accountId,
    title,
    signal: rating,
    at: ratedAt,
  }));
  const toWatch = circleItems.filter((item) => item.watchedAt === undefined);
  for (const item of toWatch)
    for (const accountId of item.wantedBy)
      signals.push({ accountId, title: item.title, signal: "wants", at: item.addedAt });
  const seen = [
    ...circleItems.filter((item) => item.watchedAt !== undefined).map((item) => item.title),
    ...circleSessions.filter(isFinished).flatMap((session) => seanceTitle(session) ?? []),
  ];
  for (const title of seen)
    for (const member of members) signals.push({ accountId: member.accountId, title, signal: "watched" });
  const started = circleSessions
    .filter((session) => session.catalog?.type === "tv" && !isFinished(session))
    .flatMap((session) => seanceTitle(session) ?? []);
  return { members, signals, toWatch, seen, started };
}
