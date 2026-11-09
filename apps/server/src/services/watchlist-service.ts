import { randomUUID } from "node:crypto";
import { type AddToWatchlistRequest, type CatalogRef, catalogKey, type WatchlistItem } from "@annamour/protocol";
import { BadRequestError, NotFoundError } from "../errors.ts";
import type { Repositories } from "../storage/repositories.ts";

export interface WatchlistServiceOptions {
  repositories: Pick<Repositories, "watchlist" | "participations" | "circles">;
  now: () => number;
  newId?: () => string;
}

const NOT_IN_LIST = "Ce titre n'est plus dans ta liste.";

/**
 * « Notre liste ». A title is shared with chosen people its author
 * watched with, or with « Tout le monde »: everyone in the author's history,
 * people met after it was added included. Everyone who sees it may vote,
 * start it or remove it. Nobody can push a title onto a stranger's list.
 */
export class WatchlistService {
  private readonly repositories: WatchlistServiceOptions["repositories"];
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor({ repositories, now, newId = randomUUID }: WatchlistServiceOptions) {
    this.repositories = repositories;
    this.now = now;
    this.newId = newId;
  }

  list(accountId: string): WatchlistItem[] {
    return this.repositories.watchlist.listFor(accountId);
  }

  /**
   * Adds a title, or, when it is already in the list I see, shares that one
   * with the people picked and records my wish: a title is in a list once.
   * Returns the item's id.
   */
  add(accountId: string, request: AddToWatchlistRequest): string {
    if (request.circleId !== undefined) return this.addToCircle(accountId, request, request.circleId);
    const { watchlist, participations } = this.repositories;
    // « Tout le monde » is not a list of names taken now: it follows the author's history (see the repository).
    const everyone = request.shareWith === "everyone";
    const chosen: readonly string[] = request.shareWith === "everyone" ? [] : request.shareWith;
    const companions = participations.companionIds(accountId);
    if (chosen.some((id) => !companions.includes(id)))
      throw new BadRequestError("On ne partage qu'avec des gens avec qui tu as déjà regardé une séance.");
    const memberIds = [accountId, ...new Set(chosen)];
    const key = catalogKey(request.title);
    const existing = watchlist.findToWatch(accountId, key);
    if (existing) {
      for (const id of memberIds) watchlist.addMember(existing, id, false);
      if (everyone) watchlist.shareWithEveryone(existing);
      if (request.want) watchlist.setWant(existing, accountId, true);
      return existing;
    }
    const id = this.newId();
    watchlist.insert({
      id,
      catalogKey: key,
      title: request.title,
      addedBy: accountId,
      addedAt: this.now(),
      memberIds,
      everyone,
      wantedBy: request.want ? [accountId] : [],
    });
    return id;
  }

  /** A title for a circle: everyone in it sees it, those who join it later too. Once per circle. */
  private addToCircle(accountId: string, request: AddToWatchlistRequest, circleId: string): string {
    const { watchlist, circles } = this.repositories;
    if (!circles.isMember(circleId, accountId))
      throw new NotFoundError("Ce cercle n'existe plus, ou tu n'en fais plus partie.");
    const key = catalogKey(request.title);
    const existing = watchlist.findToWatch(accountId, key, circleId);
    if (existing) {
      if (request.want) watchlist.setWant(existing, accountId, true);
      return existing;
    }
    const id = this.newId();
    watchlist.insert({
      id,
      catalogKey: key,
      title: request.title,
      addedBy: accountId,
      addedAt: this.now(),
      memberIds: [accountId],
      everyone: false,
      wantedBy: request.want ? [accountId] : [],
      circleId,
    });
    return id;
  }

  setWant(accountId: string, itemId: string, want: boolean): void {
    this.requireMember(accountId, itemId);
    this.repositories.watchlist.setWant(itemId, accountId, want);
  }

  /**
   * A séance watched a film to its end: it becomes « vu » in the list of the séance's circle, and in
   * the older lists without a circle of its people. Never in another circle: Dune seen with Léo stays
   * to watch with Inès. A séance watched alone has no circle: only its person's lists without one.
   */
  markWatchedBySeance(code: string, film: CatalogRef): void {
    const { circles, watchlist } = this.repositories;
    const key = catalogKey(film);
    const circleId = circles.roomCircle(code) ?? null;
    const items = new Set(
      circles.roomAccounts(code).flatMap((accountId) => watchlist.toWatchForSeance(accountId, key, circleId)),
    );
    for (const itemId of items) watchlist.setWatched(itemId, this.now(), code);
  }

  /** « C'est vu » or « Pas encore vu »: for everyone who sees the title; the list remembers who said it. */
  setWatched(accountId: string, itemId: string, watched: boolean): void {
    this.requireMember(accountId, itemId);
    const { watchlist } = this.repositories;
    if (watched) watchlist.markWatchedBy(itemId, this.now(), accountId);
    else watchlist.setWatched(itemId, null);
  }

  /** « Retirer de la liste »: gone for everyone it was shared with. */
  remove(accountId: string, itemId: string): void {
    this.requireMember(accountId, itemId);
    this.repositories.watchlist.delete(itemId);
  }

  private requireMember(accountId: string, itemId: string): void {
    if (!this.repositories.watchlist.canSee(itemId, accountId)) throw new NotFoundError(NOT_IN_LIST);
  }
}
