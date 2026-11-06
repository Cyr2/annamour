import { isRoomCode, normalizeRoomCode } from "@annamour/protocol";
import { House } from "lucide-react";
import { useState } from "react";
import { useRoom, useRoomConnection } from "../../sync/room.ts";
import { usePlayerSync } from "../../sync/usePlayerSync.ts";
import { Countdown } from "../../ui/Countdown.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { NoticeScreen } from "../../ui/NoticeScreen.tsx";
import { PlayerView } from "../player/PlayerView.tsx";
import { useMemberNotices } from "../player/usePlayerEffects.ts";
import { LobbyView } from "./LobbyView.tsx";
import { useSessionStage } from "./useSessionStage.ts";

/** One séance: the salon first, then the film, on the same connection and the same video element. */
export function SessionScreen({ code: raw }: { code: string }) {
  const code = normalizeRoomCode(raw);
  const valid = isRoomCode(code);
  const client = useRoomConnection(valid ? code : null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const player = usePlayerSync(video, client);
  const { stage, countdown, start } = useSessionStage(player.controls);
  const status = useRoom((s) => s.status);
  const error = useRoom((s) => s.error);
  useMemberNotices();

  if (!valid || status === "failed") {
    return <RoomUnavailable message={error?.message ?? "Aucune séance avec ce code."} />;
  }

  return (
    <>
      <PlayerView
        code={code}
        active={stage === "watching"}
        video={video}
        onVideo={setVideo}
        player={player}
        client={client}
      />
      {stage === "lobby" ? (
        <div className="fixed inset-0 z-20 overflow-y-auto">
          <LobbyView code={code} onStart={start} />
        </div>
      ) : null}
      <Countdown value={countdown} />
    </>
  );
}

function RoomUnavailable({ message }: { message: string }) {
  return (
    <NoticeScreen>
      <p role="alert" className="text-md text-fg">
        {message}
      </p>
      <LinkButton href="/" variant="filled" icon={<House />}>
        Retour à l'accueil
      </LinkButton>
    </NoticeScreen>
  );
}
