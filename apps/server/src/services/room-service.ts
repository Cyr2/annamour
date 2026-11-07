import { MAX_EPISODES, nextEpisodeLabel } from "@annamour/protocol";
import { NotFoundError, TooManyEpisodesError } from "../errors.ts";
import { importHls } from "../hls.ts";
import type { RoomStore } from "../room-store.ts";
import type { Room } from "../rooms.ts";
import type { TextFetcher } from "../safe-fetch.ts";
import type { HistoryService } from "./history-service.ts";

export const DEFAULT_ROOM_TITLE = "Notre séance";

export interface RoomServiceOptions {
  store: RoomStore;
  history: HistoryService;
  fetchText: TextFetcher;
  now: () => number;
}

export class RoomService {
  private readonly options: RoomServiceOptions;

  constructor(options: RoomServiceOptions) {
    this.options = options;
  }

  /** Imports the stream once; a session created while signed in joins its creator's history. */
  async create(url: URL, title: string | undefined, accountId: string | undefined): Promise<Room> {
    const { store, history, fetchText, now } = this.options;
    const imported = await importHls(url, fetchText);
    const room = store.create(title ?? DEFAULT_ROOM_TITLE, imported, now());
    if (accountId !== undefined) history.recordParticipation(room.code, accountId);
    return room;
  }

  /**
   * Queues the next episode of a séance, imported like a new séance. Without
   * a label it follows the last one's (« É5 » → « É6 »). Returns its index.
   */
  async addEpisode(code: string, url: URL, label: string | undefined): Promise<number> {
    const { store, fetchText } = this.options;
    const room = store.get(code);
    if (!room) throw new NotFoundError("Cette séance n'existe plus.");
    if (room.episodeCount >= MAX_EPISODES) throw new TooManyEpisodesError();
    const imported = await importHls(url, fetchText);
    return store.addEpisode(room, label ?? nextEpisodeLabel(room.lastEpisodeLabel, room.episodeCount), imported);
  }
}
