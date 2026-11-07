import { randomUUID } from "node:crypto";
import { type AddToWatchlistRequest, catalogKey, type WatchlistItem } from "@annamour/protocol";
import { BadRequestError, NotFoundError } from "../errors.ts";
import type { Repositories } from "../storage/repositories.ts";

export interface WatchlistServiceOptions {
  repositories: Pick<Repositories, "watchlist" | "participations">;
  now: () => number;
  newId?: () => string;
}

const NOT_IN_LIST = "Ce titre n'est plus dans ta liste.";

/**
 * « À regarder ensemble ». A title is shared with people its author already
 * watched with; everyone it is shared with sees it and may vote, start it or
 * remove it. Nobody can push a title onto a stranger's list.
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
    const { watchlist, participations } = this.repositories;
    const companions = participations.companionIds(accountId);
    const chosen = request.shareWith === "everyone" ? companions : request.shareWith;
    if (chosen.some((id) => !companions.includes(id)))
      throw new BadRequestError("On ne partage qu'avec des gens avec qui tu as déjà regardé une séance.");
    const memberIds = [accountId, ...new Set(chosen)];
    const key = catalogKey(request.title);
    const existing = watchlist.findToWatch(accountId, key);
    if (existing) {
      for (const id of memberIds) watchlist.addMember(existing, id, false);
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
      wantedBy: request.want ? [accountId] : [],
    });
    return id;
  }

  setWant(accountId: string, itemId: string, want: boolean): void {
    this.requireMember(accountId, itemId);
    this.repositories.watchlist.setWant(itemId, accountId, want);
  }

  setWatched(accountId: string, itemId: string, watched: boolean): void {
    this.requireMember(accountId, itemId);
    this.repositories.watchlist.setWatched(itemId, watched ? this.now() : null);
  }

  /** « Retirer de la liste »: gone for everyone it was shared with. */
  remove(accountId: string, itemId: string): void {
    this.requireMember(accountId, itemId);
    this.repositories.watchlist.delete(itemId);
  }

  private requireMember(accountId: string, itemId: string): void {
    if (!this.repositories.watchlist.isMember(itemId, accountId)) throw new NotFoundError(NOT_IN_LIST);
  }
}
