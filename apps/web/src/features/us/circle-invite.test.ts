import type { Circle } from "@annamour/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/circles.ts", () => ({
  inviteToCircle: vi.fn(async (id: string) => ({ token: `token-of-${id}-0123456789`, expiresAt: 0 })),
  inviteUrl: (token: string) => `https://annamour.app/cercle/${token}`,
}));
vi.mock("../../ui/toast.ts", () => ({ toast: vi.fn() }));
const api = await import("../../api/circles.ts");
const { toast } = await import("../../ui/toast.ts");
const { invitationText, inviteToCircleNow } = await import("./circle-invite.ts");

const darius = { accountId: "darius", name: "Darius", color: "peach" } as const;
const annou = { accountId: "annou", name: "Annou", color: "rose" } as const;
const circle = (id: string, extra: Partial<Circle> = {}) =>
  ({ id, members: [darius, annou], evenings: 1, lastUsedAt: 0, ...extra }) as Circle;

function stubNavigator(share: ((data: ShareData) => Promise<void>) | undefined) {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { share, clipboard: { writeText } });
  return writeText;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("inviting someone into a circle", () => {
  it("names the circle as the person invited sees it, without a « toi » that is not them", () => {
    expect(invitationText(circle("c1"))).toBe("Rejoins « Darius et Annou » sur Annamour");
    expect(invitationText(circle("c2", { name: "Les potes du jeudi" }))).toBe(
      "Rejoins « Les potes du jeudi » sur Annamour",
    );
  });

  it("asks the server for a link once, then shares it straight from the tap", async () => {
    const share = vi.fn(async () => {});
    stubNavigator(share);
    await inviteToCircleNow(circle("kept"));
    await inviteToCircleNow(circle("kept"));
    expect(api.inviteToCircle).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenLastCalledWith({
      title: "Annamour",
      text: "Rejoins « Darius et Annou » sur Annamour",
      url: "https://annamour.app/cercle/token-of-kept-0123456789",
    });
  });

  it("copies the link when sharing is refused, and says so", async () => {
    const writeText = stubNavigator(async () => {
      throw new DOMException("no gesture", "NotAllowedError");
    });
    await inviteToCircleNow(circle("refused"));
    expect(writeText).toHaveBeenCalledWith("https://annamour.app/cercle/token-of-refused-0123456789");
    expect(toast).toHaveBeenCalledWith({ message: "Lien copié" });
  });

  it("copies the link where there is no share sheet", async () => {
    const writeText = stubNavigator(undefined);
    await inviteToCircleNow(circle("desktop"));
    expect(writeText).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith({ message: "Lien copié" });
  });

  it("does nothing when the share sheet is closed", async () => {
    const writeText = stubNavigator(async () => {
      throw new DOMException("closed", "AbortError");
    });
    await inviteToCircleNow(circle("closed"));
    expect(writeText).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
