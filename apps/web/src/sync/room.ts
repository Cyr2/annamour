import type { ErrorCode, Member, PlaybackAction, PlaybackState, RoomSnapshot } from "@annamour/protocol";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { currentIdentity } from "./identity.ts";
import { clearReactions, showReaction } from "./reactions.ts";
import { type ConnectionStatus, SyncClient } from "./SyncClient.ts";

/* The room as this device knows it, fed by the SyncClient. */

export interface PlaybackEvent {
  action: PlaybackAction;
  /** Member id; absent when the server itself acted (resume after a wait). */
  by: string | undefined;
  /** Increments with every event, handy as a React key or pulse counter. */
  seq: number;
}

export interface RoomState {
  status: ConnectionStatus;
  /** This device's member id, from the welcome. */
  you: string | null;
  room: RoomSnapshot | null;
  members: Member[];
  /** Authoritative playback, owned by the server. */
  playback: PlaybackState | null;
  lastEvent: PlaybackEvent | null;
  /** The séance moved to another episode: who did it (absent when the room did, e.g. everyone left). */
  episodeEvent: { by: string | undefined; seq: number } | null;
  error: { code: ErrorCode; message: string } | null;
}

const empty: RoomState = {
  status: "idle",
  you: null,
  room: null,
  members: [],
  playback: null,
  lastEvent: null,
  episodeEvent: null,
  error: null,
};

export const useRoom = create<RoomState>()(() => ({ ...empty }));

/** Pipes a client into the room store. Returns an unbind function. */
export function bindRoom(client: SyncClient): () => void {
  useRoom.setState({ ...empty });
  let seq = 0;

  const offStatus = client.onStatus((status) => useRoom.setState({ status }));
  const offMessage = client.on((message) => {
    switch (message.type) {
      case "welcome":
        useRoom.setState({
          you: message.you,
          room: message.room,
          members: message.room.members,
          playback: message.room.playback,
          error: null,
        });
        break;
      case "playback":
        useRoom.setState({
          playback: message.playback,
          lastEvent: { action: message.action, by: message.by, seq: ++seq },
        });
        break;
      case "members":
        useRoom.setState({ members: message.members });
        break;
      // Episodes changed: the whole room again, its playback included (a new episode starts at 0).
      case "room": {
        const moved = useRoom.getState().room?.current !== message.room.current;
        useRoom.setState({
          room: message.room,
          members: message.room.members,
          playback: message.room.playback,
          ...(moved ? { episodeEvent: { by: message.by, seq: ++seq } } : {}),
        });
        break;
      }
      case "error":
        useRoom.setState({ error: { code: message.code, message: message.message } });
        break;
      case "reaction": {
        const { you, members } = useRoom.getState();
        showReaction(message, you, members);
        break;
      }
      case "pong":
        break;
    }
  });

  return () => {
    offStatus();
    offMessage();
    clearReactions();
  };
}

/**
 * Connects to a room for as long as the calling component is mounted and
 * returns the client (null until the effect has run).
 */
export function useRoomConnection(code: string | null): SyncClient | null {
  const [client, setClient] = useState<SyncClient | null>(null);

  useEffect(() => {
    if (!code) return;
    const next = new SyncClient({ room: code, identity: currentIdentity });
    const unbind = bindRoom(next);
    next.connect();
    setClient(next);
    return () => {
      unbind();
      next.close();
      setClient(null);
      useRoom.setState({ ...empty });
    };
  }, [code]);

  return client;
}

/** The séance stands paused because someone else is loading (a « wait » this device did not cause). */
export function waitingForOthers({ playback, lastEvent, you }: RoomState): boolean {
  if (playback?.status !== "paused" || lastEvent?.action !== "wait") return false;
  return lastEvent.by !== undefined && lastEvent.by !== you;
}

/** Display helper: the member who caused an event, if any. */
export function memberById(members: Member[], id: string | undefined): Member | undefined {
  return id ? members.find((m) => m.id === id) : undefined;
}
