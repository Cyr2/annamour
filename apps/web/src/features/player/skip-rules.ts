import { type CatalogTitle, inCredits, inIntro, nearEndWithoutCredits, type RoomSnapshot } from "@annamour/protocol";
import { episodeName } from "./episode-rules.ts";

/*
 * What the player offers around the intro and the end credits: « Passer
 * l'intro », « Épisode suivant dans 10 s », « Épisode suivant », or for a
 * series with nothing queued, « Ajouter et lancer » the next episode.
 */

/** Marks the offers, so the TV remote lets OK and the arrows reach them (see useTvPlayerRemote). */
export const SKIP_OFFER_ATTRIBUTE = "data-skip-offer";

type RoomView = Pick<RoomSnapshot, "episodes" | "current" | "media" | "finished" | "countdownUntil">;

/** Where the film is, for these offers: in its intro, in its end credits, near its end (credits unknown), or none. */
export type SkipPhase = "intro" | "credits" | "near-end" | null;

export function skipPhaseOf(room: Pick<RoomView, "episodes" | "current" | "media">, position: number): SkipPhase {
  const skips = room.episodes[room.current]?.skips;
  if (inIntro(skips, position)) return "intro";
  if (inCredits(skips, position)) return "credits";
  if (nearEndWithoutCredits(skips, position, room.media.duration)) return "near-end";
  return null;
}

/** What follows, as the offers name it: « Épisode suivant · S1 · É6 », « Film suivant · Alien ». */
export interface NextUp {
  /** « Épisode suivant » or « Film suivant ». */
  kind: string;
  name: string;
  /** Its catalog title, for its poster; absent for a pasted link. */
  poster?: CatalogTitle;
}

export type SkipOffer =
  | { kind: "intro"; introEnd: number }
  /** The credits roll and the next one starts by itself at `until` (server time). */
  | { kind: "countdown"; until: number; next: NextUp }
  /** The next one is there, without a countdown: after « Regarder le générique », or near an end whose credits are unknown. */
  | { kind: "next"; next: NextUp }
  /** A series with nothing queued after this episode: its next one, added and started in one touch. */
  | { kind: "add-next" }
  | null;

export function nextUpOf(room: Pick<RoomView, "episodes" | "current" | "media">): NextUp | undefined {
  const next = room.episodes[room.current + 1];
  if (!next) return undefined;
  const film = next.catalog?.type === "movie";
  const name =
    film && next.catalog ? next.catalog.title : episodeName(room.episodes, room.current + 1, room.media.title);
  const catalog = next.catalog;
  return {
    kind: film ? "Film suivant" : "Épisode suivant",
    name,
    ...(catalog?.posterUrl
      ? { poster: { id: catalog.id, type: catalog.type, title: catalog.title, posterUrl: catalog.posterUrl } }
      : {}),
  };
}

/**
 * The offer for this moment of the film. The end screen takes over once the
 * video is over; a series' next episode is offered once (`dismissed` after
 * « Regarder le générique »).
 */
export function skipOfferOf(room: RoomView, phase: SkipPhase, dismissed: boolean): SkipOffer {
  const introEnd = room.episodes[room.current]?.skips?.introEnd;
  if (phase === "intro" && introEnd !== undefined) return { kind: "intro", introEnd };
  if (room.finished || (phase !== "credits" && phase !== "near-end")) return null;
  const next = nextUpOf(room);
  if (next) {
    // A countdown only comes from the credits (the server starts it when a device reaches them).
    if (phase === "credits" && room.countdownUntil !== null)
      return { kind: "countdown", until: room.countdownUntil, next };
    return { kind: "next", next };
  }
  const series = room.episodes[room.current]?.catalog?.type === "tv";
  return series && !dismissed ? { kind: "add-next" } : null;
}
