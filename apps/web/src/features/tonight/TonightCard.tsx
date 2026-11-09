import type { WatchlistItem } from "@annamour/protocol";
import { Play, Plus } from "lucide-react";
import { m } from "motion/react";
import { spring } from "../../lib/motion.ts";
import { sessionPath } from "../../sync/restart.ts";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { Button } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { Poster } from "../../ui/Poster.tsx";
import { Surface } from "../../ui/Surface.tsx";
import type { TonightPick } from "../circles/circle-rules.ts";
import { describeTitle } from "../home/create/CatalogResults.tsx";
import { ResumeSeanceAction } from "../sessions/ResumeSeanceAction.tsx";
import { SeanceOptions } from "../sessions/SeanceOptions.tsx";
import { SeancePoster } from "../sessions/SeancePoster.tsx";
import { resumeLine, sessionTitle } from "../sessions/session-rules.ts";
import { useSeanceOfTitle } from "../sessions/useSeanceOfTitle.ts";
import { useLaunchTitle } from "../watchlist/useLaunchTitle.ts";
import { wantersLine } from "../watchlist/watchlist-rules.ts";

interface TonightCardProps {
  pick: TonightPick;
  me: string;
  /** A series asks for its episode first: its sheet opens. */
  onOpenItem: (item: WatchlistItem) => void;
  onAdd: () => void;
}

/** « On regarde ? »: the one thing to watch tonight with the circle on screen, one tap away. */
export function TonightCard({ pick, me, onOpenItem, onAdd }: TonightCardProps) {
  return (
    <m.section
      aria-label="On regarde ?"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: spring.ui }}
    >
      <Surface className="surface-panel grid gap-4 p-5">
        {pick.kind === "resume" ? <ResumeBody pick={pick} /> : null}
        {pick.kind === "title" ? <TitleBody item={pick.item} me={me} onOpenItem={onOpenItem} /> : null}
        {pick.kind === "nothing" ? <NothingBody onAdd={onAdd} /> : null}
      </Surface>
    </m.section>
  );
}

function ResumeBody({ pick }: { pick: Extract<TonightPick, { kind: "resume" }> }) {
  const { session } = pick;
  return (
    <div className="flex items-center gap-4">
      <SeancePoster session={session} className="w-24 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-accent">On reprend ?</span>
          <SeanceOptions session={session} className="-my-2 -mr-2" />
        </span>
        <strong className="truncate font-rounded-tight text-lg font-extrabold text-fg">{sessionTitle(session)}</strong>
        <span className="text-sm text-fg-muted">{resumeLine(session, Date.now())}</span>
        <LinkButton
          href={sessionPath(session.code)}
          variant="filled"
          icon={<Play />}
          className="mt-1 justify-self-start"
        >
          Reprendre
        </LinkButton>
      </div>
    </div>
  );
}

function TitleBody({
  item,
  me,
  onOpenItem,
}: {
  item: WatchlistItem;
  me: string;
  onOpenItem: (i: WatchlistItem) => void;
}) {
  const { launch, busy, error } = useLaunchTitle();
  // Under way in this circle already: go back to it rather than start it twice.
  const ongoing = useSeanceOfTitle(item.title, item.circleId);
  const wanters = item.sharedWith
    .filter((person) => item.wantedBy.includes(person.accountId))
    .map((person) => ({ id: person.accountId, name: person.name, color: person.color }));
  return (
    <>
      <div className="flex gap-4">
        <Poster title={item.title} />
        <div className="grid min-w-0 content-center gap-1">
          <span className="text-xs font-semibold text-accent">On regarde ?</span>
          <strong className="truncate font-rounded-tight text-lg font-extrabold text-fg">{item.title.title}</strong>
          <span className="text-xs text-fg-muted">{describeTitle(item.title)}</span>
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            <BubbleStack people={wanters} />
            {wantersLine(item, me)}
          </span>
        </div>
      </div>
      {ongoing ? (
        <ResumeSeanceAction session={ongoing} />
      ) : (
        <Button
          variant="filled"
          size="large"
          icon={<Play />}
          disabled={busy}
          onClick={() => (item.title.type === "tv" ? onOpenItem(item) : void launch(item))}
        >
          {busy ? "On prépare la séance…" : "On regarde ?"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

function NothingBody({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="grid justify-items-start gap-3">
      <strong className="font-rounded-tight text-lg font-extrabold text-fg">Rien de prévu pour l'instant</strong>
      <p className="text-sm text-fg-muted">
        Ajoutez des films et des séries à votre liste : le plus voulu vous attendra ici.
      </p>
      <Button variant="filled" icon={<Plus />} onClick={onAdd}>
        Ajouter un titre
      </Button>
    </div>
  );
}
