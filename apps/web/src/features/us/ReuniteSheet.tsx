import { type Circle, circleTitle } from "@annamour/protocol";
import { Check } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "../../ui/controls.tsx";
import { cx } from "../../ui/cx.ts";
import { Sheet } from "../../ui/Sheet.tsx";
import { toast } from "../../ui/toast.ts";
import { reuniteCircles } from "../circles/circles.ts";

interface ReuniteSheetProps {
  /** The two circles of the same people; null when closed. */
  pair: readonly [Circle, Circle] | null;
  me: string;
  onClose: () => void;
}

/** « Réunir » two circles of the same people: pick the name to keep, then they become one. */
export function ReuniteSheet({ pair, me, onClose }: ReuniteSheetProps) {
  return (
    <Sheet open={pair !== null} onClose={onClose} title="Réunir les cercles">
      {pair ? <ReuniteForm pair={pair} me={me} onDone={onClose} /> : null}
    </Sheet>
  );
}

function ReuniteForm({ pair, me, onDone }: { pair: readonly [Circle, Circle]; me: string; onDone: () => void }) {
  // A name someone chose reads better than one made of first names: offered first.
  const [kept, setKept] = useState(() => (pair.find((circle) => circle.name) ?? pair[0]).id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const into = pair.find((circle) => circle.id === kept) ?? pair[0];
    const from = pair.find((circle) => circle.id !== into.id) ?? pair[1];
    setBusy(true);
    setError(null);
    try {
      await reuniteCircles(from.id, into.id);
      toast({ message: `Cercles réunis : « ${circleTitle(into, me)} »` });
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Ça n'a pas marché. Réessaie.");
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Sheet.Lede>Leurs séances et leurs listes se rejoignent. Quel nom garder ?</Sheet.Lede>
      <fieldset className="grid gap-2">
        <legend className="sr-only">Nom à garder</legend>
        {pair.map((circle) => (
          <NameChoice
            key={circle.id}
            label={circleTitle(circle, me)}
            checked={kept === circle.id}
            onSelect={() => setKept(circle.id)}
          />
        ))}
      </fieldset>
      <p role="alert" className="min-h-5 text-sm text-danger">
        {error ?? ""}
      </p>
      <Sheet.Actions>
        <Button type="submit" variant="filled" disabled={busy}>
          {busy ? "Un instant…" : "Réunir"}
        </Button>
      </Sheet.Actions>
    </form>
  );
}

/** One name to keep: a native radio, so arrows and screen readers work as anywhere else. */
function NameChoice({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <label
      className={cx(
        "flex min-h-14 cursor-pointer items-center gap-3 rounded-control px-4 transition-colors duration-200",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--am-focus)]",
        checked ? "bg-accent-soft text-fg" : "bg-fill-soft text-fg hover:bg-fill-hover",
      )}
    >
      <input type="radio" name="kept-name" checked={checked} onChange={onSelect} className="sr-only" />
      <span className="min-w-0 flex-1 truncate font-rounded-tight font-extrabold">{label}</span>
      <span
        aria-hidden
        className={cx(
          "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200",
          checked ? "border-accent bg-accent text-on-accent" : "border-line-strong",
        )}
      >
        {checked ? <Check className="size-4" strokeWidth={3} /> : null}
      </span>
    </label>
  );
}
