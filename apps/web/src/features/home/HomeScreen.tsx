import { LogIn, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useIdentity } from "../../sync/identity.ts";
import { Button } from "../../ui/controls.tsx";
import { cx } from "../../ui/cx.ts";
import { EmptyBubble } from "../../ui/EmptyBubble.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { type BubbleSize, PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { RedThread } from "../../ui/RedThread.tsx";
import { useTv } from "../tv/tv-context.ts";
import { CreateSessionSheet } from "./create/CreateSessionSheet.tsx";
import { asksToCreate } from "./create/create-link.ts";
import { HomeTopBar } from "./HomeTopBar.tsx";
import { ResumeSlot } from "./ResumeSlot.tsx";

/** Only a TV downloads its shelf of séances. */
const TvHomeShelf = lazy(() => import("./TvHomeShelf.tsx").then((m) => ({ default: m.TvHomeShelf })));

/* Home: my bubble waiting at one end of a slack thread, and the two ways in. */

export function HomeScreen() {
  const tv = useTv();
  const askedToCreate = asksToCreate(useSearch());
  const [creating, setCreating] = useState(askedToCreate);
  const [, navigate] = useLocation();

  // The sheet opens from the link, then the flag leaves the address: closing it, or reloading, stays on home.
  useEffect(() => {
    if (!askedToCreate) return;
    setCreating(true);
    navigate("/", { replace: true });
  }, [askedToCreate, navigate]);

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <HomeTopBar />
      <main className={cx("grid flex-1 place-items-center text-center", tv ? "content-center gap-7 py-2" : "py-8")}>
        <div className="grid w-[min(38.75rem,100%)] justify-items-center gap-5">
          <WaitingThread size={tv ? "md" : "lg"} />
          <h1 className="type-display">Une soirée ensemble</h1>
          <p className="type-lede">Le même film, à la même seconde, chacun chez soi.</p>
          {tv ? null : (
            <>
              <div className="mt-3 grid w-full gap-3 sm:flex sm:w-auto sm:justify-center">
                <Button variant="filled" size="large" icon={<Plus />} onClick={() => setCreating(true)}>
                  Créer une séance
                </Button>
                <LinkButton href="/rejoindre" size="large" icon={<LogIn />}>
                  Rejoindre
                </LinkButton>
              </div>
              <ResumeSlot />
            </>
          )}
        </div>
        {tv ? (
          <Suspense fallback={null}>
            <TvHomeShelf />
          </Suspense>
        ) : null}
      </main>
      {tv ? null : <CreateSessionSheet open={creating} onClose={() => setCreating(false)} />}
    </div>
  );
}

function WaitingThread({ size }: { size: BubbleSize }) {
  const name = useIdentity((s) => s.name);
  const color = useIdentity((s) => s.color);
  return (
    <RedThread.Root synced={false} className="mb-4 w-[min(22.5rem,78%)]">
      <RedThread.Line />
      <div className="flex items-center justify-between">
        <RedThread.Anchor index={0}>
          <PresenceBubble name={name || "Toi"} color={color} status="alone" size={size} />
        </RedThread.Anchor>
        <RedThread.Anchor index={1}>
          <EmptyBubble label="Une place libre" size={size} />
        </RedThread.Anchor>
      </div>
    </RedThread.Root>
  );
}
