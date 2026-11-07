import type { PlayCatalogRequest, RoomSnapshot } from "@annamour/protocol";
import { useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";
import { playCatalog } from "../../../api/catalog.ts";
import { errorMessage } from "../../../api/http.ts";
import { createRoom, fetchRoom } from "../../../api/rooms.ts";
import { circleForNewSeance } from "../../circles/circles.ts";
import { circleUiNow } from "../../ui-version/ui-version.ts";

export type CreateSessionState =
  | { step: "link"; error: string | null }
  | { step: "loading" }
  | { step: "ready"; room: RoomSnapshot };

const START: CreateSessionState = { step: "link", error: null };

/**
 * Title or link → import (the server fetches the playlist) → the room as
 * everyone will see it. The circles interface skips that last step and opens
 * the salon at once: languages and subtitles are chosen from the player.
 */
export function useCreateSession() {
  const [state, setState] = useState<CreateSessionState>(START);
  const [, navigate] = useLocation();
  // A closed sheet must not send anyone to the salon on a late answer.
  const attempt = useRef(0);

  /** Runs one way of creating the room, then shows it (or opens its salon). */
  const run = useCallback(
    async (create: () => Promise<string>) => {
      const mine = ++attempt.current;
      setState({ step: "loading" });
      try {
        const room = await fetchRoom(await create());
        if (mine !== attempt.current) return;
        if (circleUiNow()) navigate(`/s/${room.code}`);
        else setState({ step: "ready", room });
      } catch (error) {
        if (mine === attempt.current) setState({ step: "link", error: errorMessage(error) });
      }
    },
    [navigate],
  );

  const prepare = useCallback(
    (url: string, title: string) => run(() => createRoom(url, title, circleForNewSeance())),
    [run],
  );
  const prepareFromCatalog = useCallback(
    (play: PlayCatalogRequest) => run(() => playCatalog(play, circleForNewSeance())),
    [run],
  );

  const reset = useCallback(() => {
    attempt.current++;
    setState(START);
  }, []);

  return { state, prepare, prepareFromCatalog, reset };
}
