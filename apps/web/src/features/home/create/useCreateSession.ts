import type { PlayCatalogRequest } from "@annamour/protocol";
import { useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";
import { playCatalog } from "../../../api/catalog.ts";
import { errorMessage } from "../../../api/http.ts";
import { createRoom, fetchRoom } from "../../../api/rooms.ts";

export type CreateSessionState = { step: "link"; error: string | null } | { step: "loading" };

const START: CreateSessionState = { step: "link", error: null };

/**
 * Title or link → import (the server fetches the playlist) → straight into the
 * salon: languages and subtitles are chosen there, from the player, by each one.
 * The séance goes to the circle picked on the sheet (null: nobody in particular).
 */
export function useCreateSession() {
  const [state, setState] = useState<CreateSessionState>(START);
  const [, navigate] = useLocation();
  // A closed sheet must not send anyone to the salon on a late answer.
  const attempt = useRef(0);

  /** Runs one way of creating the room, then opens its salon. */
  const run = useCallback(
    async (create: () => Promise<string>) => {
      const mine = ++attempt.current;
      setState({ step: "loading" });
      try {
        const room = await fetchRoom(await create());
        if (mine === attempt.current) navigate(`/s/${room.code}`);
      } catch (error) {
        if (mine === attempt.current) setState({ step: "link", error: errorMessage(error) });
      }
    },
    [navigate],
  );

  const prepare = useCallback(
    (url: string, title: string, circleId: string | null) => run(() => createRoom(url, title, circleId)),
    [run],
  );
  const prepareFromCatalog = useCallback(
    (play: PlayCatalogRequest, circleId: string | null) => run(() => playCatalog(play, circleId)),
    [run],
  );

  const reset = useCallback(() => {
    attempt.current++;
    setState(START);
  }, []);

  return { state, prepare, prepareFromCatalog, reset };
}
