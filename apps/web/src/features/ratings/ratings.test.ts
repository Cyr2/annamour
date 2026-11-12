import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/ratings.ts", () => ({
  fetchRatings: vi.fn(),
  rateTitle: vi.fn(),
  unrateTitle: vi.fn(),
}));
const api = await import("../../api/ratings.ts");
const { setMyRating, useRatings } = await import("./ratings.ts");

const me = { accountId: "darius", name: "Darius", color: "peach" } as const;
const verity = { id: 8809, type: "movie", title: "Verity" } as const;
const mine = () => useRatings.getState().ratings.find((rating) => rating.by.accountId === "darius")?.rating;

beforeEach(() => {
  vi.mocked(api.rateTitle).mockReset();
  useRatings.setState({ status: "ready", ratings: [] });
});

describe("my avis", () => {
  it("shows at once, and goes back to the one before when the server refuses", async () => {
    vi.mocked(api.rateTitle).mockResolvedValueOnce(undefined);
    await setMyRating(me, verity, "liked");
    vi.mocked(api.rateTitle).mockRejectedValueOnce(new Error("hors ligne"));
    const refused = setMyRating(me, verity, "loved");
    expect(mine()).toBe("loved");
    await expect(refused).rejects.toThrow();
    expect(mine()).toBe("liked");
  });

  it("keeps the latest choice when an earlier one fails after it", async () => {
    let failFirst: (error: Error) => void = () => {};
    vi.mocked(api.rateTitle)
      .mockImplementationOnce(() => new Promise((_, reject) => (failFirst = reject)))
      .mockResolvedValueOnce(undefined);
    const first = setMyRating(me, verity, "meh");
    await setMyRating(me, verity, "loved");
    failFirst(new Error("hors ligne"));
    await expect(first).rejects.toThrow();
    expect(mine()).toBe("loved");
  });
});
