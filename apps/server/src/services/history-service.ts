import type { SessionSummary } from "@annamour/protocol";
import { NotFoundError, NotYoursToDeleteError, SeanceInUseError } from "../errors.ts";
import type { RoomStore } from "../room-store.ts";
import type { QueuedItem } from "../storage/participation-repository.ts";
import type { Repositories } from "../storage/repositories.ts";

export interface HistoryServiceOptions {
  repositories: Pick<Repositories, "participations" | "rooms" | "watchlist" | "circles">;
  store: RoomStore;
  now: () => number;
  /** Someone with an account is now in this séance (its circle follows, see CircleService.syncRoom). */
  onParticipation?: (roomCode: string) => void;
}

/** A séance's films or episodes, sent only when it has several; one without a name of its own takes the séance's. */
function queueOf(items: readonly QueuedItem[] | undefined, seanceTitle: string): Pick<SessionSummary, "queue"> {
  if (!items || items.length < 2) return {};
  return { queue: items.map(({ title, ...rest }) => ({ title: title ?? seanceTitle, ...rest })) };
}

/**
 * The poster on a séance's card: its current title's, or for a series that of another of its
 * episodes (those queued with « Épisode suivant » used to come without one).
 */
function posterOf(
  posterUrl: string | undefined,
  index: number,
  items: readonly QueuedItem[] | undefined,
): Pick<SessionSummary, "posterUrl"> {
  const playing = items?.[index];
  const poster =
    posterUrl ??
    (playing?.type === "tv"
      ? items?.find((item) => item.type === "tv" && item.title === playing.title && item.posterUrl)?.posterUrl
      : undefined);
  return poster === undefined ? {} : { posterUrl: poster };
}

function circleOf(
  circleId: string | undefined,
  circle: SessionSummary["circle"],
): Pick<SessionSummary, "circleId" | "circle"> {
  if (circleId === undefined) return {};
  return circle === undefined ? { circleId } : { circleId, circle };
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

  /**
   * Someone who watched as a guest, then made an account (« Garder cette séance »), keeps the
   * séance they were in. Knowing its code is what joining asks anyway: nothing more is revealed.
   */
  keep(roomCode: string, accountId: string): void {
    if (!this.repositories.rooms.exists(roomCode)) throw new NotFoundError("Cette séance n'existe plus.");
    this.recordParticipation(roomCode, accountId);
  }

  list(accountId: string): SessionSummary[] {
    const companions = this.repositories.participations.companions(accountId);
    const queues = this.repositories.participations.queues(accountId);
    const circles = this.repositories.circles.circlesOfRooms(accountId);
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
      ...queueOf(queues.get(room.code), room.title),
      ...circleOf(room.circleId, circles.get(room.code)),
      ...posterOf(room.posterUrl, room.episode.index, queues.get(room.code)),
      ...(room.catalog === undefined ? {} : { catalog: room.catalog }),
      ...(room.createdBy === accountId ? { createdByMe: true } : {}),
    }));
  }

  /**
   * Leaves a séance: gone from my séances and my circles' counts; the others keep it, and my bubble on it,
   * marked gone (we were there together). Joining again brings it back.
   */
  leave(roomCode: string, accountId: string): void {
    if (!this.repositories.participations.hide(roomCode, accountId))
      throw new NotFoundError("Cette séance n'est pas dans tes séances.");
  }

  /** « Oui, c'est fini »: the video on screen of one of my séances counts as watched to its end. */
  finish(roomCode: string, accountId: string): void {
    const room = this.repositories.participations.includes(roomCode, accountId) ? this.store.get(roomCode) : undefined;
    if (!room) throw new NotFoundError("Cette séance n'est pas dans tes séances.");
    if (!room.finishCurrent(this.now())) throw new SeanceInUseError();
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
