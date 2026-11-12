import {
  type Circle,
  type CircleTaste,
  catalogKey,
  type Participant,
  type SessionSummary,
  type SuggestionReason,
  type TitleRating,
  type WatchlistItem,
} from "@annamour/protocol";
import { joinNames } from "../../lib/format.ts";
import { isFinished } from "../sessions/session-rules.ts";

/** What a circle's suggestions are read from: its people, its list, their avis, what it already watched. */
export function circleTaste(
  circle: Circle,
  items: readonly WatchlistItem[],
  ratings: readonly TitleRating[],
  sessions: readonly SessionSummary[],
): CircleTaste {
  const watched = new Set<string>();
  for (const session of sessions)
    if (session.circleId === circle.id && session.catalog && isFinished(session))
      watched.add(catalogKey(session.catalog));
  return {
    members: circle.members,
    items: items.filter((item) => item.circleId === circle.id),
    ratings,
    watched,
  };
}

const VERBS = {
  wants: { me: "Tu en as envie", one: "en a envie", withMe: "en avez envie", many: "en ont envie" },
  loved: { me: "Tu as adoré", one: "a adoré", withMe: "avez adoré", many: "ont adoré" },
  liked: { me: "Tu as aimé", one: "a aimé", withMe: "avez aimé", many: "ont aimé" },
} as const;

/** « Annou a adoré », « Toi et Annou en avez envie », « Léo et Inès ont aimé »: why a title is suggested. */
export function reasonLine({ kind, people }: SuggestionReason, me: string): string {
  const verbs = VERBS[kind];
  const others = people.filter((person: Participant) => person.accountId !== me).map((person) => person.name);
  const withMe = others.length < people.length;
  if (others.length === 0) return verbs.me;
  if (withMe) return `Toi et ${joinNames(others)} ${verbs.withMe}`;
  return `${joinNames(others)} ${others.length > 1 ? verbs.many : verbs.one}`;
}
