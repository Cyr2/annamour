import type { CatalogTitle } from "@annamour/protocol";
import { useRef } from "react";
import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { dismissRateQuestion, useRateQuestion } from "./rate-question.ts";
import { TitleRatings } from "./TitleRatings.tsx";

/** « Ton avis ? » after leaving a film that was over (see rate-question.ts); one touch answers, « Plus tard » skips. */
export function RateQuestionSheet() {
  const title = useRateQuestion((s) => s.title);
  // The sheet slides away with its title still on it.
  const shown = useRef<CatalogTitle | null>(null);
  if (title) shown.current = title;
  const asked = shown.current;

  return (
    <Sheet open={title !== null} onClose={dismissRateQuestion} title="Ton avis ?">
      {asked ? (
        <div className="grid gap-5">
          <Sheet.Lede>
            Comment tu as trouvé « {asked.title} » ? Les autres le verront, et vos idées pour ce soir en tiendront
            compte.
          </Sheet.Lede>
          <TitleRatings title={asked} onRated={dismissRateQuestion} quietHeading />
          <Button onClick={dismissRateQuestion}>Plus tard</Button>
        </div>
      ) : null}
    </Sheet>
  );
}
