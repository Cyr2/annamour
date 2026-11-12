import { describe, expect, it } from "vitest";
import {
  type CatalogTitle,
  myRating,
  type Participant,
  RatedTitleParams,
  RateRequest,
  type Rating,
  ratingsOf,
  type SuggestionReason,
  suggestForCircle,
  type TitleRating,
  type WatchlistItem,
} from "../src/index.ts";

const darius = { accountId: "darius", name: "Darius", color: "peach" } as const;
const annou = { accountId: "annou", name: "Annou", color: "rose" } as const;
const leo = { accountId: "leo", name: "Léo", color: "mint" } as const;

const title = (id: number, name = `Titre ${id}`): CatalogTitle => ({ id, type: "movie", title: name });
const VERITY = title(1, "Verity");
const ANNE = { id: 2, type: "tv", title: "Anne" } as const;
const DUNE = title(3, "Dune");

const rated = (by: Participant, rating: Rating, what: CatalogTitle, ratedAt = 1): TitleRating => ({
  by,
  title: what,
  rating,
  ratedAt,
});

function item(what: CatalogTitle, wantedBy: string[], overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: `item-${what.id}`,
    title: what,
    addedBy: darius,
    addedAt: 0,
    sharedWith: [darius, annou],
    wantedBy,
    circleId: "nous",
    ...overrides,
  };
}

describe("an avis", () => {
  it("is one of four, on a catalog title", () => {
    expect(RateRequest.safeParse({ title: VERITY, rating: "loved" }).success).toBe(true);
    expect(RateRequest.safeParse({ title: VERITY, rating: "masterpiece" }).success).toBe(false);
  });

  it("is taken back by the title's kind and number, as the address gives them", () => {
    expect(RatedTitleParams.parse({ type: "tv", id: "2" })).toEqual({ type: "tv", id: 2 });
    expect(RatedTitleParams.safeParse({ type: "tv", id: "deux" }).success).toBe(false);
  });

  it("lists who said what on a title, mine first then the latest", () => {
    const ratings = [rated(annou, "loved", VERITY, 5), rated(leo, "meh", VERITY, 9), rated(darius, "liked", VERITY, 1)];
    expect(ratingsOf([...ratings, rated(annou, "liked", DUNE)], VERITY, "darius").map((r) => r.by.name)).toEqual([
      "Darius",
      "Léo",
      "Annou",
    ]);
    expect(myRating(ratings, VERITY, "darius")).toBe("liked");
    expect(myRating(ratings, DUNE, "darius")).toBeUndefined();
  });
});

describe("the suggestions of a circle", () => {
  const taste = (items: WatchlistItem[], ratings: TitleRating[] = [], watched: string[] = []) => ({
    members: [darius, annou],
    items,
    ratings,
    watched: new Set(watched),
  });
  const titles = (taste: Parameters<typeof suggestForCircle>[0]) =>
    suggestForCircle(taste).map((suggestion) => suggestion.title.title);

  it("puts first what the most people want, and says who", () => {
    const [first, second] = suggestForCircle(taste([item(DUNE, ["darius"]), item(VERITY, ["darius", "annou"])]));
    expect(first?.title).toEqual(VERITY);
    expect(first?.itemId).toBe("item-1");
    expect(first?.reasons).toEqual([{ kind: "wants", people: [darius, annou] }] satisfies SuggestionReason[]);
    expect(second?.title).toEqual(DUNE);
  });

  it("suggests a title someone of the circle loved elsewhere and the others have not seen", () => {
    const [suggestion] = suggestForCircle(taste([], [rated(annou, "loved", ANNE)]));
    expect(suggestion).toMatchObject({ title: ANNE, reasons: [{ kind: "loved", people: [annou] }] });
    expect(suggestion?.itemId).toBeUndefined();
  });

  it("weighs a loved title over a merely wanted one, and a liked one under it", () => {
    const ratings = [rated(annou, "loved", ANNE), rated(annou, "liked", VERITY)];
    expect(titles(taste([item(DUNE, ["darius"])], ratings))).toEqual(["Anne", "Dune", "Verity"]);
  });

  it("leaves out what someone did not like, what everyone saw, and what the circle watched together", () => {
    const ratings = [
      rated(annou, "loved", VERITY),
      rated(darius, "disliked", VERITY),
      rated(annou, "liked", DUNE),
      rated(darius, "liked", DUNE),
    ];
    expect(titles(taste([item(ANNE, ["annou"])], ratings, ["tv:2"]))).toEqual([]);
  });

  it("drops a title found bof more than it is wanted, and those already watched from the list", () => {
    const ratings = [rated(annou, "meh", VERITY), rated(leo, "loved", VERITY)];
    const watched = item(DUNE, ["darius", "annou"], { watchedAt: 5 });
    expect(titles(taste([watched], ratings))).toEqual([]);
  });

  it("ignores the avis of people outside the circle", () => {
    expect(titles(taste([], [rated(leo, "loved", ANNE)]))).toEqual([]);
  });

  it("has nothing to suggest to a circle of one", () => {
    expect(suggestForCircle({ ...taste([item(DUNE, ["darius"])]), members: [darius] })).toEqual([]);
  });
});
