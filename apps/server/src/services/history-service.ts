import type { SessionSummary } from "@annamour/protocol";
import { NotFoundError } from "../errors.ts";
import type { RoomStore } from "../room-store.ts";
import type { Repositories } from "../storage/repositories.ts";

export interface HistoryServiceOptions {
  repositories: Pick<Repositories, "participations">;
  store: RoomStore;
  now: () => number;
}

/** The sessions each account took part in: the same session shows up for everyone in it. */
export class HistoryService {
  private readonly repositories: HistoryServiceOptions["repositories"];
  private readonly store: RoomStore;
  private readonly now: () => number;

  constructor({ repositories, store, now }: HistoryServiceOptions) {
    this.repositories = repositories;
    this.store = store;
    this.now = now;
  }

  recordParticipation(roomCode: string, accountId: string): void {
    this.repositories.participations.record(roomCode, accountId, this.now());
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
    }));
  }

  /** Hides a session from this account's history only; the others keep it. */
  hide(roomCode: string, accountId: string): void {
    if (!this.repositories.participations.hide(roomCode, accountId))
      throw new NotFoundError("Cette séance n'est pas dans ton historique.");
  }
}
