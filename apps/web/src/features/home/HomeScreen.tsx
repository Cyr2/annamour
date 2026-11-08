import { lazy, Suspense } from "react";
import { useIdentity } from "../../sync/identity.ts";
import { EmptyBubble } from "../../ui/EmptyBubble.tsx";
import { type BubbleSize, PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { RedThread } from "../../ui/RedThread.tsx";
import { HomeTopBar } from "./HomeTopBar.tsx";

/** Downloaded only by a TV, the one place this home shows. */
const TvHomeShelf = lazy(() => import("./TvHomeShelf.tsx").then((m) => ({ default: m.TvHomeShelf })));

/* The TV's home, made for the remote: my bubble waiting at one end of a slack thread, then the séances to resume. Phones and computers have « Ce soir ». */

export function HomeScreen() {
  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <HomeTopBar />
      <main className="grid flex-1 content-center place-items-center gap-7 py-2 text-center">
        <div className="grid w-[min(38.75rem,100%)] justify-items-center gap-5">
          <WaitingThread size="md" />
          <h1 className="type-display">Une soirée ensemble</h1>
          <p className="type-lede">Le même film, à la même seconde, chacun chez soi.</p>
        </div>
        <Suspense fallback={null}>
          <TvHomeShelf />
        </Suspense>
      </main>
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
