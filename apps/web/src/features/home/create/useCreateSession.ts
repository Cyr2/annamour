import type { PlayCatalogRequest, RoomSnapshot } from "@annamour/protocol";
import { useCallback, useRef, useState } from "react";
import { playCatalog } from "../../../api/catalog.ts";
import { errorMessage } from "../../../api/http.ts";
import { createRoom, fetchRoom } from "../../../api/rooms.ts";

export type CreateSessionState =
  | { step: "link"; error: string | null }
  | { step: "loading" }
  | { step: "ready"; room: RoomSnapshot };

const START: CreateSessionState = { step: "link", error: null };

/** Link → import (the server fetches the playlist) → the room as everyone will see it. */
export function useCreateSession() {
  const [state, setState] = useState<CreateSessionState>(START);
  // A closed sheet must not be reopened on "ready" by a late answer.
  const attempt = useRef(0);

  /** Runs one way of creating the room, then shows it as everyone will see it. */
  const run = useCallback(async (create: () => Promise<string>) => {
    const mine = ++attempt.current;
    setState({ step: "loading" });
    try {
      const room = await fetchRoom(await create());
      if (mine === attempt.current) setState({ step: "ready", room });
    } catch (error) {
      if (mine === attempt.current) setState({ step: "link", error: errorMessage(error) });
    }
  }, []);

  const prepare = useCallback((url: string, title: string) => run(() => createRoom(url, title)), [run]);
  const prepareFromCatalog = useCallback((play: PlayCatalogRequest) => run(() => playCatalog(play)), [run]);

  const reset = useCallback(() => {
    attempt.current++;
    setState(START);
  }, []);

  return { state, prepare, prepareFromCatalog, reset };
}
