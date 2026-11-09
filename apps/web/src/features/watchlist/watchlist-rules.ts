import type { Participant, WatchlistItem } from "@annamour/protocol";
import { joinNames, plural } from "../../lib/format.ts";
import { describeTitle } from "../home/create/CatalogResults.tsx";
import { relativeDay } from "../sessions/session-rules.ts";

/* What the watchlist says, in French: who is in it, who wants what, who added it, when it was watched. */

/**
 * The filter bubbles: the people of my list (never me) who are also in my history, the most shared
 * with first. Someone whose séances I removed no longer shows, as on my profile.
 */
export function peopleOf(items: readonly WatchlistItem[], me: string, known: ReadonlySet<string>): Participant[] {
  const counts = new Map<string, { person: Participant; count: number }>();
  for (const item of items) {
    for (const person of item.sharedWith) {
      if (person.accountId === me || !known.has(person.accountId)) continue;
      const entry = counts.get(person.accountId) ?? { person, count: 0 };
      counts.set(person.accountId, { ...entry, count: entry.count + 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).map((entry) => entry.person);
}

export function wantsLabel(count: number): string {
  return plural(count, "envie");
}

/** « Film · 2024 · 2 h 10 · ajouté par Léo », « … · ajouté par toi ». */
export function itemLine(item: WatchlistItem, me: string): string {
  const author = item.addedBy.accountId === me ? "toi" : item.addedBy.name;
  return `${describeTitle(item.title)} · ajouté par ${author}`;
}

/** The others an item is shared with, by name (never me). */
function othersOf(item: WatchlistItem, me: string): string[] {
  return item.sharedWith.filter((person) => person.accountId !== me).map((person) => person.name);
}

/** « Pour toi, Léo et Inès »: who sees it. */
export function audienceLine(item: WatchlistItem, me: string): string {
  return `Pour ${joinNames(["toi", ...othersOf(item, me)])}`;
}

/** « Vu mardi avec Léo et Inès ». */
export function watchedLine(item: WatchlistItem, me: string, now: number): string {
  const when = item.watchedAt === undefined ? "" : ` ${relativeDay(item.watchedAt, now).toLocaleLowerCase("fr")}`;
  const others = othersOf(item, me);
  return `Vu${when}${others.length ? ` avec ${joinNames(others)}` : ""}`;
}

/** The others (never me) who want an item, by name. */
function othersWanting(item: WatchlistItem, me: string): string[] {
  return item.sharedWith
    .filter((person) => person.accountId !== me && item.wantedBy.includes(person.accountId))
    .map((person) => person.name);
}

function othersWant(others: readonly string[]): string {
  return `${joinNames(others)} en ${others.length > 1 ? "ont" : "a"} envie`;
}

/** « Léo et Inès en ont envie », « Léo et toi en avez envie », « Tu en as envie », or nobody yet. */
export function wantersLine(item: WatchlistItem, me: string): string {
  const others = othersWanting(item, me);
  const mine = item.wantedBy.includes(me);
  if (mine) return others.length ? `${joinNames([...others, "toi"])} en avez envie` : "Tu en as envie";
  if (others.length === 0) return "Personne n'a encore dit en avoir envie";
  return othersWant(others);
}

/**
 * Beside my own heart, only the others: « Léo et Inès en ont envie », or nobody else yet. My heart
 * already says whether I want it, so this line never repeats it.
 */
export function othersWantingLine(item: WatchlistItem, me: string): string {
  const others = othersWanting(item, me);
  if (others.length) return othersWant(others);
  return item.wantedBy.includes(me) ? "Personne d'autre pour l'instant" : "Personne pour l'instant";
}

/** The heart's spoken name: what pressing it says about me. */
export function wantToggleLabel(item: WatchlistItem): string {
  return `J'ai envie de voir ${item.title.title}`;
}
