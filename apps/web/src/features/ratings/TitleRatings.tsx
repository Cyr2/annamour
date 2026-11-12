import { type CatalogTitle, myRating, type Participant, RATING_WORDS, ratingsOf } from "@annamour/protocol";
import { useEffect, useId } from "react";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { cx } from "../../ui/cx.ts";
import { RatingPicker } from "../../ui/RatingPicker.tsx";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { loadRatings, setMyRating, useRatings } from "./ratings.ts";

interface TitleRatingsProps {
  title: CatalogTitle;
  /** Watched: asks for my avis. Otherwise only the avis already given show (none: nothing). */
  askMine?: boolean;
  className?: string;
  /** Called once my avis is given (not when taken back). */
  onRated?: () => void;
  /** The sheet around already says « Ton avis ? »: the heading stays for screen readers only. */
  quietHeading?: boolean;
}

/** « Ton avis » on a title, then each other person's, with their bubble: « Annou a adoré 😍 ». */
export function TitleRatings({ title, askMine = true, className, onRated, quietHeading = false }: TitleRatingsProps) {
  const headingId = useId();
  const account = useAccount((state) => state.account);
  const ratings = useRatings((state) => state.ratings);
  useEffect(() => {
    void loadRatings();
  }, []);
  if (!account) return null;

  const me: Participant = { accountId: account.id, name: account.name, color: account.color };
  const mine = myRating(ratings, title, me.accountId);
  const others = ratingsOf(ratings, title, me.accountId).filter((rating) => rating.by.accountId !== me.accountId);
  const asking = askMine || mine !== undefined;
  if (!asking && others.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className={cx("text-left", className)}>
      <h3 id={headingId} className={quietHeading ? "sr-only" : "mb-2 text-sm font-semibold text-fg"}>
        {asking ? "Ton avis" : "Leurs avis"}
      </h3>
      {asking ? (
        <RatingPicker
          value={mine}
          label={`Ton avis sur « ${title.title} »`}
          onChange={(rating) => {
            if (rating) onRated?.();
            void setMyRating(me, title, rating ?? null).catch((failure: Error) => toast({ message: failure.message }));
          }}
        />
      ) : null}
      {others.length ? (
        <ul className="mt-3 grid gap-2 text-left">
          {others.map(({ by, rating }) => (
            <li key={by.accountId} className="flex items-center gap-2 text-sm text-fg-muted">
              <BubbleStack people={[{ id: by.accountId, name: by.name, color: by.color }]} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {by.name} {RATING_WORDS[rating].said}
              </span>
              <span aria-hidden className="text-lg leading-none">
                {RATING_WORDS[rating].emoji}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
