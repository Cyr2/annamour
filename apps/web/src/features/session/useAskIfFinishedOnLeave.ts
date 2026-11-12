import { useEffect, useRef } from "react";
import { type RoomState, useRoom } from "../../sync/room.ts";
import { useAccount } from "../account/account.ts";
import { askRatingIfNone, titleToRateOnLeave } from "../ratings/rate-question.ts";
import { askIfFinished, finishQuestion, type WatchedTo } from "../sessions/finish-question.ts";

/**
 * Leaving the salon right before the end asks « C'est fini ? » on the next
 * screen. Only for a film watched on this visit (its position is the video's,
 * not a saved one) and for an account, which has séances to keep.
 */
export function useAskIfFinishedOnLeave(video: HTMLVideoElement | null) {
  const watchedTo = useRef<WatchedTo | null>(null);

  useEffect(() => {
    if (!video) return;
    const note = () => {
      const episode = useRoom.getState().room?.current;
      // The position belongs to the episode on screen: the next one starting is not the end of this one.
      if (video.currentTime > 0 && episode !== undefined) watchedTo.current = { episode, position: video.currentTime };
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
      const watched = watchedTo.current;
      if (!last.room || watched === null || useAccount.getState().status !== "member") return;
      const othersStaying = last.members.some((member) => member.id !== last.you);
      askIfFinished(finishQuestion(last.room, watched, othersStaying));
      // Left once it was over (during the credits, mostly): « Ton avis ? » on the next screen.
      const toRate = titleToRateOnLeave(last.room, watched);
      const me = useAccount.getState().account?.id;
      if (toRate && me) void askRatingIfNone(toRate, me);
    };
  }, []);
}
