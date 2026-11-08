import type { Account } from "@annamour/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

const anna: Account = { id: "a1", name: "Anna", color: "lilac", hasPasskey: false };
const key = ["lune", "panda", "velours", "cerise"];

vi.mock("../../api/accounts.ts", () => ({
  fetchMe: vi.fn(),
  createAccount: vi.fn(async () => ({ account: anna, key })),
  loginWithKey: vi.fn(async () => anna),
  linkWithToken: vi.fn(async () => anna),
  updateAccount: vi.fn(async (changes: object) => ({ ...anna, ...changes })),
  logout: vi.fn(async () => undefined),
  checkKey: vi.fn(async () => true),
}));
vi.mock("../../api/passkeys.ts", () => ({
  loginWithPasskey: vi.fn(async () => anna),
  registerPasskey: vi.fn(async () => undefined),
}));

const api = await import("../../api/accounts.ts");
const {
  createAccount,
  linkWithToken,
  loginWithKey,
  loginWithPasskey,
  logout,
  refreshAccount,
  registerPasskey,
  updateProfile,
  useAccount,
} = await import("./account.ts");
const { useIdentity } = await import("../../sync/identity.ts");

async function refreshAccountAs(account: Account) {
  vi.mocked(api.fetchMe).mockResolvedValueOnce(account);
  await refreshAccount();
}

beforeEach(() => {
  vi.mocked(api.checkKey).mockClear();
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

  it("never shows the previous account's words after moving to another account by QR code", async () => {
    await createAccount("Anna", "lilac");
    vi.mocked(api.linkWithToken).mockResolvedValueOnce({ ...anna, id: "another-account" });
    await linkWithToken("abcdefghijklmnop");
    expect(useAccount.getState().key).toBeNull();
    useAccount.setState({ account: null, key: null });
    await refreshAccountAs({ ...anna, id: "another-account" });
    expect(useAccount.getState().key).toBeNull();
  });

  it("shows words saved by an older version only once the server says they open this account", async () => {
    localStorage.setItem("annamour:key:v1", JSON.stringify(key));
    vi.mocked(api.checkKey).mockResolvedValueOnce(true);
    await refreshAccountAs(anna);
    await vi.waitFor(() => expect(useAccount.getState().key).toEqual(key));

    localStorage.clear();
    useAccount.setState({ account: null, key: null });
    localStorage.setItem("annamour:key:v1", JSON.stringify(key));
    vi.mocked(api.checkKey).mockResolvedValueOnce(false);
    await refreshAccountAs(anna);
    await vi.waitFor(() => expect(localStorage.getItem("annamour:key:v1")).toBeNull());
    expect(useAccount.getState().key).toBeNull();
  });

  it("asks again later when the old words could not be checked", async () => {
    localStorage.setItem("annamour:key:v1", JSON.stringify(key));
    vi.mocked(api.checkKey).mockRejectedValueOnce(new Error("offline"));
    await refreshAccountAs(anna);
    await vi.waitFor(() => expect(api.checkKey).toHaveBeenCalled());
    expect(localStorage.getItem("annamour:key:v1")).not.toBeNull();
    expect(useAccount.getState().key).toBeNull();
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

  it("saves a new prénom and colour, and the room bubble follows", async () => {
    await createAccount("Anna", "lilac");
    await updateProfile({ name: "Annie", color: "mint" });
    expect(useAccount.getState().account).toMatchObject({ name: "Annie", color: "mint" });
    expect(useIdentity.getState()).toMatchObject({ name: "Annie", color: "mint" });
  });

  it("forgets the account and its key on logout", async () => {
    await createAccount("Anna", "lilac");
    await logout();
    expect(api.logout).toHaveBeenCalled();
    expect(useAccount.getState()).toMatchObject({ status: "guest", account: null, key: null });
  });
});
