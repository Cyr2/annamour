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

/** « mardi », « aujourd'hui », « il y a 3 semaines ». */
function whenWatched(watchedAt: number, now: number): string {
  const day = relativeDay(watchedAt, now).toLocaleLowerCase("fr");
  return /^\d/.test(day) ? `il y a ${day}` : day;
}

/** How a title became « vu »: « Vu en séance, mardi », « Marqué vu par Léo, hier », « Marqué vu, mardi ». */
export function watchedHowLine(item: WatchlistItem, me: string, now: number): string {
  if (item.watchedAt === undefined) return "";
  const when = whenWatched(item.watchedAt, now);
  if (item.watchedInSeance) return `Vu en séance, ${when}`;
  if (!item.watchedBy) return `Marqué vu, ${when}`;
  const who = item.watchedBy.accountId === me ? "toi" : item.watchedBy.name;
  return `Marqué vu par ${who}, ${when}`;
}

/** Names them up to this many others; beyond, « tout le cercle » or « tout le monde » reads better. */
const NAMED_AUDIENCE_MAX = 3;

/**
 * For whom « C'est vu » and « Retirer » count: everyone who sees the title.
 * « Rien que pour toi », « Pour Léo et toi », « Pour tout le cercle », « Pour tout le monde ».
 */
export function actionAudience(item: WatchlistItem, me: string): string {
  const others = othersOf(item, me);
  if (others.length === 0) return "Rien que pour toi";
  if (others.length <= NAMED_AUDIENCE_MAX) return `Pour ${joinNames([...others, "toi"])}`;
  return item.circleId === undefined ? "Pour tout le monde" : "Pour tout le cercle";
}

/** Removing a title others see takes it from them too: that asks first. */
export function removalNeedsConfirmation(item: WatchlistItem, me: string): boolean {
  return othersOf(item, me).length > 0;
}

/** What the confirmation says: who loses it, and what goes with it. */
export function removalWarning(item: WatchlistItem, me: string): string {
  return `« ${item.title.title} » disparaîtra aussi de la liste de ${joinNames(othersOf(item, me))}, avec les envies de chacun.`;
}

/** « Rangé dans « Déjà vus » pour Léo et toi », « Remis dans « À voir » »: for whom, when others see it. */
export function watchedToast(item: WatchlistItem, me: string, watched: boolean): string {
  const done = watched ? "Rangé dans « Déjà vus »" : "Remis dans « À voir »";
  return withAudience(done, item, me);
}

/** « « Interstellar » retiré de la liste pour tout le monde ». */
export function removedToast(item: WatchlistItem, me: string): string {
  return withAudience(`« ${item.title.title} » retiré de la liste`, item, me);
}

function withAudience(done: string, item: WatchlistItem, me: string): string {
  if (!removalNeedsConfirmation(item, me)) return done;
  const audience = actionAudience(item, me);
  // Only its first letter: the names in it keep their capitals.
  return `${done} ${audience.charAt(0).toLocaleLowerCase("fr")}${audience.slice(1)}`;
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
