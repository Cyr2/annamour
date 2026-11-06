import type { Account } from "@annamour/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

const anna: Account = { id: "a1", name: "Anna", color: "lilac", hasPasskey: false };
const key = ["lune", "panda", "velours", "cerise"];

vi.mock("../../api/accounts.ts", () => ({
  fetchMe: vi.fn(),
  createAccount: vi.fn(async () => ({ account: anna, key })),
  loginWithKey: vi.fn(async () => anna),
  linkWithToken: vi.fn(async () => anna),
}));
vi.mock("../../api/passkeys.ts", () => ({
  loginWithPasskey: vi.fn(async () => anna),
  registerPasskey: vi.fn(async () => undefined),
}));

const api = await import("../../api/accounts.ts");
const { createAccount, linkWithToken, loginWithKey, loginWithPasskey, refreshAccount, registerPasskey, useAccount } =
  await import("./account.ts");
const { useIdentity } = await import("../../sync/identity.ts");

beforeEach(() => {
  localStorage.clear();
  useAccount.setState({ status: "checking", account: null, key: null });
});

describe("account store", () => {
  it("creates the account, keeps the key on this device and adopts its bubble", async () => {
    await expect(createAccount("Anna", "lilac")).resolves.toEqual(key);
    expect(useAccount.getState()).toMatchObject({ status: "member", account: anna, key });
    expect(useIdentity.getState()).toMatchObject({ name: "Anna", color: "lilac" });
    expect(localStorage.length).toBeGreaterThan(0);
  });

  it("signs in with the key, a QR link or a passkey", async () => {
    await loginWithKey(["lune", "panda", "velours", "cerise"]);
    expect(useAccount.getState().key).toEqual(key);
    await expect(linkWithToken("abcdefghijklmnop")).resolves.toEqual(anna);
    await expect(loginWithPasskey()).resolves.toEqual(anna);
    expect(useAccount.getState().status).toBe("member");
  });

  it("marks the passkey once registered", async () => {
    await createAccount("Anna", "lilac");
    await registerPasskey();
    expect(useAccount.getState().account?.hasPasskey).toBe(true);
  });

  it("asks the server who this device is", async () => {
    vi.mocked(api.fetchMe).mockResolvedValueOnce(anna);
    await refreshAccount();
    expect(useAccount.getState().status).toBe("member");

    vi.mocked(api.fetchMe).mockResolvedValueOnce(null);
    await refreshAccount();
    expect(useAccount.getState()).toMatchObject({ status: "guest", account: null, key: null });
  });

  it("stays usable offline: an unreachable server makes a new device a guest", async () => {
    vi.mocked(api.fetchMe).mockRejectedValueOnce(new Error("offline"));
    await refreshAccount();
    expect(useAccount.getState().status).toBe("guest");
  });
});
