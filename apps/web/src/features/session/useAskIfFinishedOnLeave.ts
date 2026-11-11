import { useEffect, useRef } from "react";
import { type RoomState, useRoom } from "../../sync/room.ts";
import { useAccount } from "../account/account.ts";
import { askIfFinished, finishQuestion } from "../sessions/finish-question.ts";

/**
 * Leaving the salon right before the end asks « C'est fini ? » on the next
 * screen. Only for a film watched on this visit (its position is the video's,
 * not a saved one) and for an account, which has séances to keep.
 */
export function useAskIfFinishedOnLeave(video: HTMLVideoElement | null) {
  const watchedTo = useRef<number | null>(null);

  useEffect(() => {
    if (!video) return;
    const note = () => {
      if (video.currentTime > 0) watchedTo.current = video.currentTime;
    };
    video.addEventListener("timeupdate", note);
    return () => video.removeEventListener("timeupdate", note);
  }, [video]);

  useEffect(() => {
    let last: RoomState = useRoom.getState();
    // The room is emptied as the connection closes: keep the last state that had one.
    const off = useRoom.subscribe((state) => {
      if (state.room) last = state;
    });
    return () => {
      off();
      const position = watchedTo.current;
      if (!last.room || position === null || useAccount.getState().status !== "member") return;
      const othersStaying = last.members.some((member) => member.id !== last.you);
      askIfFinished(finishQuestion(last.room, position, othersStaying));
    };
  }, []);
}
