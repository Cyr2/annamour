import { LogIn, Plus } from "lucide-react";
import { useState } from "react";
import { useIdentity } from "../../sync/identity.ts";
import { Button } from "../../ui/controls.tsx";
import { EmptyBubble } from "../../ui/EmptyBubble.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { RedThread } from "../../ui/RedThread.tsx";
import { CreateSessionSheet } from "./create/CreateSessionSheet.tsx";
import { HomeTopBar } from "./HomeTopBar.tsx";
import { ResumeSlot } from "./ResumeSlot.tsx";

/* Home: my bubble waiting at one end of a slack thread, and the two ways in. */

export function HomeScreen() {
  const [creating, setCreating] = useState(false);

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <HomeTopBar />
      <main className="grid flex-1 place-items-center py-8 text-center">
        <div className="grid w-[min(620px,100%)] justify-items-center gap-5">
          <WaitingThread />
          <h1 className="type-display">Une soirée ensemble</h1>
          <p className="type-lede">Le même film, à la même seconde, chacun chez soi.</p>
          <div className="mt-3 grid w-full gap-3 sm:flex sm:w-auto sm:justify-center">
            <Button variant="filled" size="large" icon={<Plus />} onClick={() => setCreating(true)}>
              Créer une séance
            </Button>
            <LinkButton href="/rejoindre" size="large" icon={<LogIn />}>
              Rejoindre
            </LinkButton>
          </div>
          <ResumeSlot />
        </div>
      </main>
      <CreateSessionSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function WaitingThread() {
  const name = useIdentity((s) => s.name);
  const color = useIdentity((s) => s.color);
  return (
    <RedThread.Root synced={false} className="mb-4 w-[min(360px,78%)]">
      <RedThread.Line />
      <div className="flex items-center justify-between">
        <RedThread.Anchor index={0}>
          <PresenceBubble name={name || "Toi"} color={color} status="alone" size="lg" />
        </RedThread.Anchor>
        <RedThread.Anchor index={1}>
          <EmptyBubble label="Une place libre" />
        </RedThread.Anchor>
      </div>
    </RedThread.Root>
  );
}
