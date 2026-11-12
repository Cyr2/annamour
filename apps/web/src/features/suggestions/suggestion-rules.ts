import type { CatalogMediaType, Participant, SuggestionWhy } from "@annamour/protocol";
import { joinNames } from "../../lib/format.ts";

/* How « Pour vous ce soir » says why a title is there. */

const VERBS = {
  wants: { me: "Tu en as envie", one: "en a envie", withMe: "en avez envie", many: "en ont envie" },
  loved: { me: "Tu l'as adoré", one: "l'a adoré", withMe: "l'avez adoré", many: "l'ont adoré" },
  liked: { me: "Tu l'as aimé", one: "l'a aimé", withMe: "l'avez aimé", many: "l'ont aimé" },
} as const;

function peopleLine(kind: keyof typeof VERBS, people: readonly Participant[], me: string): string {
  const verbs = VERBS[kind];
  const others = people.filter((person) => person.accountId !== me).map((person) => person.name);
  if (others.length === 0) return verbs.me;
  if (others.length < people.length) return `Toi et ${joinNames(others)} ${verbs.withMe}`;
  return `${joinNames(others)} ${others.length > 1 ? verbs.many : verbs.one}`;
}

const capitalized = (text: string) => `${text.charAt(0).toLocaleUpperCase("fr")}${text.slice(1)}`;

/**
 * « Anna l'a adoré », « Toi et Anna en avez envie », « Parce que vous avez aimé
 * Gone Girl », « Réalisé par David Fincher », « Thriller, votre genre »,
 * « Très bien noté : 8,1 sur 10 ».
 */
export function reasonLine(reason: SuggestionWhy, me: string, type: CatalogMediaType = "movie"): string {
  switch (reason.kind) {
    case "wants":
    case "loved":
    case "liked":
      return peopleLine(reason.kind, reason.people, me);
    case "because":
      return `Parce que vous avez aimé ${joinNames(reason.titles)}`;
    case "director":
      return `${type === "tv" ? "Créé" : "Réalisé"} par ${reason.name}`;
    case "genres":
      return `${capitalized(joinNames(reason.genres))}, ${reason.genres.length > 1 ? "vos genres" : "votre genre"}`;
    case "acclaimed":
      return `Très bien noté : ${reason.voteAverage.toLocaleString("fr-FR")} sur 10`;
  }
}

/** « Pile pour vous deux », or for a bigger circle « Pile pour vous ». */
export function perfectLabel(members: number): string {
  return members === 2 ? "Pile pour vous deux" : "Pile pour vous";
}
