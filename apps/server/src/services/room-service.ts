import { type CatalogRef, MAX_EPISODES, nextEpisodeLabel, youTubeVideoId } from "@annamour/protocol";
import { LiveSeanceError, NotFoundError, TooManyEpisodesError } from "../errors.ts";
import { type ImportedMedia, importHls } from "../hls.ts";
import type { FirstEpisode, RoomStore } from "../room-store.ts";
import type { Room } from "../rooms.ts";
import type { TextFetcher } from "../safe-fetch.ts";
import { importYouTube } from "../youtube.ts";
import type { HistoryService } from "./history-service.ts";

export const DEFAULT_ROOM_TITLE = "Notre séance";

export interface RoomServiceOptions {
  store: RoomStore;
  history: HistoryService;
  fetchText: TextFetcher;
  now: () => number;
  /** Told of each new séance (to start preparing its lighter qualities before anyone opens it). */
  onCreated?: (code: string) => void;
  /** Told when an episode is queued (to get it ready before everyone moves on to it). */
  onEpisodeAdded?: (code: string) => void;
}

export class RoomService {
  private readonly options: RoomServiceOptions;

  constructor(options: RoomServiceOptions) {
    this.options = options;
  }

  /** Imports the stream once; a session created while signed in joins its creator's history. */
  async create(
    url: URL,
    title: string | undefined,
    accountId: string | undefined,
    first: FirstEpisode = {},
  ): Promise<Room> {
    const { store, history, now } = this.options;
    const { media: imported, title: found } = await this.importLink(url);
    const room = store.create(title ?? found ?? DEFAULT_ROOM_TITLE, imported, now(), first);
    if (accountId !== undefined) history.recordParticipation(room.code, accountId);
    this.options.onCreated?.(room.code);
    return room;
  }

  /**
   * Queues the next episode of a séance, imported like a new séance. Without
   * a label it follows the last one's (« É5 » → « É6 »). The others are told
   * who added it, when `byClientId` is a device in the séance. Returns its index.
   */
  async addEpisode(
    code: string,
    url: URL,
    label: string | undefined,
    catalog?: CatalogRef,
    byClientId?: string,
  ): Promise<number> {
    const room = this.roomAcceptingEpisode(code);
    const { media: imported, title } = await this.importLink(url);
    // A YouTube video is named after itself, not « É6 ».
    const name = label ?? title ?? nextEpisodeLabel(room.lastEpisodeLabel, room.episodeCount);
    const index = this.options.store.addEpisode(room, name, imported, catalog, byClientId);
    this.options.onEpisodeAdded?.(code);
    return index;
  }

  /**
   * Checks that `code` names a séance with room for one more episode, before
   * anything is fetched; the catalog asks too, so it never spends a call on Naka for nothing.
   */
  roomAcceptingEpisode(code: string): Room {
    const room = this.options.store.get(code);
    if (!room) throw new NotFoundError("Cette séance n'existe plus.");
    if (room.media.youtube?.live) throw new LiveSeanceError();
    if (room.episodeCount >= MAX_EPISODES) throw new TooManyEpisodesError();
    return room;
  }

  /** A YouTube link plays in YouTube's player (its title comes along); any other is an HLS stream to import. */
  private async importLink(url: URL): Promise<{ media: ImportedMedia; title?: string }> {
    const videoId = youTubeVideoId(url.href);
    if (videoId) return importYouTube(videoId, this.options.fetchText);
    return { media: await importHls(url, this.options.fetchText) };
  }
}
