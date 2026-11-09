import type { SessionSummary } from "@annamour/protocol";
import { NotFoundError, NotYoursToDeleteError } from "../errors.ts";
import type { RoomStore } from "../room-store.ts";
import type { Repositories } from "../storage/repositories.ts";

export interface HistoryServiceOptions {
  repositories: Pick<Repositories, "participations" | "rooms" | "watchlist">;
  store: RoomStore;
  now: () => number;
  /** Someone with an account is now in this séance (its circle follows, see CircleService.syncRoom). */
  onParticipation?: (roomCode: string) => void;
}

/** The sessions each account took part in: the same session shows up for everyone in it. */
export class HistoryService {
  private readonly repositories: HistoryServiceOptions["repositories"];
  private readonly store: RoomStore;
  private readonly now: () => number;
  private readonly onParticipation: (roomCode: string) => void;

  constructor({ repositories, store, now, onParticipation = () => {} }: HistoryServiceOptions) {
    this.repositories = repositories;
    this.store = store;
    this.now = now;
    this.onParticipation = onParticipation;
  }

  recordParticipation(roomCode: string, accountId: string): void {
    this.repositories.participations.record(roomCode, accountId, this.now());
    this.onParticipation(roomCode);
  }

  list(accountId: string): SessionSummary[] {
    const companions = this.repositories.participations.companions(accountId);
    const now = this.now();
    return this.repositories.participations.visibleRooms(accountId).map((room) => ({
      code: room.code,
      title: room.title,
      ...(room.duration === undefined ? {} : { duration: room.duration }),
      position: this.store.livePosition(room.code, now) ?? room.position,
      lastUsedAt: room.lastUsedAt,
      participants: companions.get(room.code) ?? [],
      episode: {
        index: room.episode.index,
        count: room.episode.count,
        ...(room.episode.label === undefined ? {} : { label: room.episode.label }),
      },
      ...(room.circleId === undefined ? {} : { circleId: room.circleId }),
      ...(room.posterUrl === undefined ? {} : { posterUrl: room.posterUrl }),
      ...(room.catalog === undefined ? {} : { catalog: room.catalog }),
      ...(room.createdBy === accountId ? { createdByMe: true } : {}),
    }));
  }

  /** Leaves a séance: gone from my séances and my circles' counts; the others keep it. Joining again brings it back. */
  leave(roomCode: string, accountId: string): void {
    if (!this.repositories.participations.remove(roomCode, accountId))
      throw new NotFoundError("Cette séance n'est pas dans tes séances.");
  }

  /**
   * The person who created a séance deletes it for everyone: its séance,
   * episodes and positions go, and the titles it marked « vu » go back to watch.
   */
  deleteForEveryone(roomCode: string, accountId: string): void {
    const { rooms, watchlist } = this.repositories;
    const creator = rooms.creatorOf(roomCode);
    if (creator === undefined) throw new NotFoundError("Cette séance n'existe plus.");
    if (creator !== accountId) throw new NotYoursToDeleteError();
    watchlist.unwatchSeance(roomCode);
    this.store.forget(roomCode);
    rooms.delete(roomCode);
  }
}
