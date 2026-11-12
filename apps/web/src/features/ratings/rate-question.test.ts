import type { RoomSnapshot } from "@annamour/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/ratings.ts", () => ({ fetchRatings: vi.fn(), rateTitle: vi.fn(), unrateTitle: vi.fn() }));
const api = await import("../../api/ratings.ts");
const { askRatingIfNone, titleToRateOnLeave, useRateQuestion } = await import("./rate-question.ts");

const verity = { id: 8809, type: "movie", title: "Verity" } as const;
const film: RoomSnapshot = {
  code: "DDVU",
  media: { title: "Verity", src: "/x.m3u8", audio: [], subtitles: [], duration: 7200 },
  playback: { status: "paused", position: 0, at: 0 },
  members: [],
  episodes: [{ duration: 7200, catalog: verity }],
  current: 0,
  finished: false,
  countdownUntil: null,
};
const bear = (n: number) => ({ catalog: { id: 1, type: "tv", title: "The Bear", season: 1, episode: n } as const });

describe("« Ton avis ? » on leaving", () => {
  it("is asked of a film left during its credits, or once over, not before", () => {
    expect(titleToRateOnLeave(film, { episode: 0, position: 7180 })).toEqual(verity);
    expect(titleToRateOnLeave({ ...film, finished: true }, { episode: 0, position: 10 })).toEqual(verity);
    expect(titleToRateOnLeave(film, { episode: 0, position: 3600 })).toBeUndefined();
    expect(titleToRateOnLeave(film, { episode: 1, position: 7180 })).toBeUndefined();
  });

  it("is asked of a series only after its last queued episode", () => {
    const series = { ...film, episodes: [bear(1), bear(2)] };
    expect(titleToRateOnLeave(series, { episode: 0, position: 7180 })).toBeUndefined();
    expect(titleToRateOnLeave({ ...series, current: 1 }, { episode: 1, position: 7180 })?.title).toBe("The Bear");
  });

  beforeEach(() => useRateQuestion.setState({ title: null }));

  it("is not asked again of a title I already gave my avis on", async () => {
    vi.mocked(api.fetchRatings).mockResolvedValueOnce([
      { by: { accountId: "darius", name: "Darius", color: "peach" }, title: verity, rating: "loved", ratedAt: 1 },
    ]);
    await askRatingIfNone(verity, "darius");
    expect(useRateQuestion.getState().title).toBeNull();
    vi.mocked(api.fetchRatings).mockResolvedValueOnce([]);
    await askRatingIfNone(verity, "anna");
    expect(useRateQuestion.getState().title).toEqual(verity);
  });
});
