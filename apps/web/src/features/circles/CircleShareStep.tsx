import { type CatalogTitle, type Circle, circleTitle, othersIn } from "@annamour/protocol";
import { Check, ChevronLeft, Heart, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { Button } from "../../ui/controls.tsx";
import { cx } from "../../ui/cx.ts";
import { Poster } from "../../ui/Poster.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { describeTitle } from "../home/create/CatalogResults.tsx";
import { addTitle } from "../watchlist/watchlist.ts";
import { loadCircles, shownCircle, useCircles } from "./circles.ts";

/**
 * Which circle it goes to: the one on screen, preselected. Without any circle
 * yet, it is for « Tout le monde » (everyone I will watch with).
 */
export function CircleShareStep({
  title,
  onBack,
  onDone,
}: {
  title: CatalogTitle;
  onBack: () => void;
  onDone: () => void;
}) {
  useEffect(() => void loadCircles(), []);
  const me = useAccount((s) => s.account?.id ?? "");
  const circles = useCircles((s) => s.circles);
  const shown = useCircles((s) => shownCircle(s));
  const [picked, setPicked] = useState<string | null>(shown ?? circles[0]?.id ?? null);
  const [want, setWant] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const circle = circles.find((c) => c.id === picked);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await addTitle({ title, shareWith: "everyone", want, ...(circle ? { circleId: circle.id } : {}) });
      toast({ message: `« ${title.title} » ajouté à ${circle ? circleTitle(circle, me) : "la liste"}` });
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Ça n'a pas marché. Réessaie.");
      setBusy(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-4">
      <div className="surface-tile flex items-center gap-3.5 p-2.5">
        <Poster title={title} />
        <span className="min-w-0">
          <span className="block truncate text-md font-semibold text-fg">{title.title}</span>
          <span className="block text-xs text-fg-muted">{describeTitle(title)}</span>
        </span>
      </div>
      {circles.length > 0 ? (
        <fieldset className="grid gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-semibold text-fg-muted">Dans quel cercle ?</legend>
          {circles.map((c) => (
            <CircleOption key={c.id} circle={c} me={me} picked={picked === c.id} onPick={() => setPicked(c.id)} />
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-fg-muted">
          Tout le monde avec qui tu regardes le verra, et pourra le lancer ou dire en avoir envie.
        </p>
      )}
      <Button
        icon={<Heart className={want ? "fill-current text-accent" : undefined} />}
        aria-pressed={want}
        onClick={() => setWant(!want)}
      >
        J'en ai envie aussi
      </Button>
      <p role="alert" className="min-h-5 text-sm text-danger">
        {error ?? ""}
      </p>
      <Sheet.Actions>
        <Button icon={<ChevronLeft />} onClick={onBack}>
          Autre titre
        </Button>
        <Button variant="filled" icon={<Plus />} disabled={busy} onClick={() => void add()}>
          {busy ? "Un instant…" : circle ? `Ajouter à ${circleTitle(circle, me)}` : "Ajouter"}
        </Button>
      </Sheet.Actions>
    </div>
  );
}

function CircleOption({
  circle,
  me,
  picked,
  onPick,
}: {
  circle: Circle;
  me: string;
  picked: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={onPick}
      className={cx(
        "surface-tile flex min-h-11 w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left",
        picked && "ring-2 ring-accent",
      )}
    >
      <BubbleStack people={othersIn(circle, me).map((p) => ({ id: p.accountId, name: p.name, color: p.color }))} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{circleTitle(circle, me)}</span>
      {picked ? <Check aria-hidden className="size-4 text-accent" /> : null}
    </button>
  );
}
