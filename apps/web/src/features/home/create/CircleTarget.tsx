import { circleTitle } from "@annamour/protocol";
import { useAccount } from "../../account/account.ts";
import { useCircles } from "../../circles/circles.ts";
import { CircleFilter } from "../../list/CircleFilter.tsx";

interface CircleTargetProps {
  circleId: string | null;
  onChange: (circleId: string | null) => void;
}

/**
 * « Pour : Les potes du jeudi »: the circle the new séance goes to, the one on
 * screen at first, with the others (or nobody in particular) a tap away.
 * Without any circle there is nothing to choose: it stays hidden.
 */
export function CircleTarget({ circleId, onChange }: CircleTargetProps) {
  const me = useAccount((s) => s.account?.id ?? "");
  const circle = useCircles((s) => s.circles.find((c) => c.id === circleId) ?? null);
  const hasCircles = useCircles((s) => s.circles.length > 0);
  if (!hasCircles) return null;

  return (
    <div className="grid min-w-0 gap-1">
      <p className="truncate px-1 text-sm text-fg-muted">
        Pour :{" "}
        <strong className="font-semibold text-fg">
          {circle ? circleTitle(circle, me) : "Personne en particulier"}
        </strong>
      </p>
      <CircleFilter value={circleId} onChange={onChange} forNewSeance />
    </div>
  );
}
