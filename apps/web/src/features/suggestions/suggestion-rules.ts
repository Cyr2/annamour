import type { GroupSuggestion, Participant, SuggestionWhy } from "@annamour/protocol";
import { joinNames } from "../../lib/format.ts";

/* How « Pour vous ce soir » says why a title is there, and how well it suits each person. */

const VERBS = {
  wants: { me: "Tu en as envie", one: "en a envie", withMe: "en avez envie", many: "en ont envie" },
  loved: { me: "Tu as adoré", one: "a adoré", withMe: "avez adoré", many: "ont adoré" },
  liked: { me: "Tu as aimé", one: "a aimé", withMe: "avez aimé", many: "ont aimé" },
} as const;

function peopleLine(kind: keyof typeof VERBS, people: readonly Participant[], me: string): string {
  const verbs = VERBS[kind];
  const others = people.filter((person) => person.accountId !== me).map((person) => person.name);
  if (others.length === 0) return verbs.me;
  if (others.length < people.length) return `Toi et ${joinNames(others)} ${verbs.withMe}`;
  return `${joinNames(others)} ${others.length > 1 ? verbs.many : verbs.one}`;
}

/**
 * « Annou a adoré », « Toi et Annou en avez envie », « Dans la lignée de Gone Girl »,
 * « Thriller et drame, vos genres », « Très bien noté : 8,1 sur 10 ».
 */
export function reasonLine(reason: SuggestionWhy, me: string): string {
  switch (reason.kind) {
    case "wants":
    case "loved":
    case "liked":
      return peopleLine(reason.kind, reason.people, me);
    case "because":
      return `Dans la lignée de ${joinNames(reason.titles)}`;
    case "genres": {
      const genres = joinNames(reason.genres);
      return `${genres.charAt(0).toLocaleUpperCase("fr")}${genres.slice(1)}, vos genres`;
    }
    case "acclaimed":
      return `Très bien noté : ${reason.voteAverage.toLocaleString("fr-FR")} sur 10`;
  }
}

/** « Toi 92 % · Anna 85 % », me first; empty when the suggestion did not come from tastes. */
export function matchLine(suggestion: GroupSuggestion, me: string): string {
  const sorted = [...suggestion.matches].sort((a, b) => Number(b.by.accountId === me) - Number(a.by.accountId === me));
  return sorted.map(({ by, match }) => `${by.accountId === me ? "Toi" : by.name} ${match} %`).join(" · ");
}
