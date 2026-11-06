import type { RoomSnapshot } from "@annamour/protocol";
import { useCallback, useRef, useState } from "react";
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

  const prepare = useCallback(async (url: string, title: string) => {
    const mine = ++attempt.current;
    setState({ step: "loading" });
    try {
      const code = await createRoom(url, title);
      const room = await fetchRoom(code);
      if (mine === attempt.current) setState({ step: "ready", room });
    } catch (error) {
      if (mine === attempt.current) setState({ step: "link", error: errorMessage(error) });
    }
  }, []);

  const reset = useCallback(() => {
    attempt.current++;
    setState(START);
  }, []);

  return { state, prepare, reset };
}
