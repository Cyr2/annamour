import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchError, safeFetchText } from "../src/safe-fetch.ts";

// A public IP literal skips DNS, so these tests never touch the network.
const PUBLIC = "https://93.184.216.34";

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("safeFetchText", () => {
  it("returns the body of a successful response", async () => {
    stubFetch(new Response("#EXTM3U", { status: 200 }));
    await expect(safeFetchText(new URL(`${PUBLIC}/a.m3u8`))).resolves.toBe("#EXTM3U");
  });

  it("refuses plain http", async () => {
    await expect(safeFetchText(new URL("http://93.184.216.34/a.m3u8"))).rejects.toThrow(/https/);
  });

  it("refuses private and local addresses, including through DNS", async () => {
    const fetchMock = stubFetch();
    for (const url of ["https://127.0.0.1/x", "https://[::1]/x", "https://192.168.1.20/x", "https://localhost/x"]) {
      await expect(safeFetchText(new URL(url)), url).rejects.toBeInstanceOf(FetchError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows a redirect and checks the new address", async () => {
    const fetchMock = stubFetch(
      new Response(null, { status: 302, headers: { location: "/moved.m3u8" } }),
      new Response("#EXTM3U moved", { status: 200 }),
    );
    await expect(safeFetchText(new URL(`${PUBLIC}/a.m3u8`))).resolves.toBe("#EXTM3U moved");
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(new URL(`${PUBLIC}/moved.m3u8`));
  });

  it("refuses a redirect towards a private address", async () => {
    stubFetch(new Response(null, { status: 301, headers: { location: "https://10.0.0.1/admin" } }));
    await expect(safeFetchText(new URL(`${PUBLIC}/a.m3u8`))).rejects.toThrow(/not reachable/);
  });

  it("gives up on broken or endless redirects", async () => {
    stubFetch(new Response(null, { status: 302 }));
    await expect(safeFetchText(new URL(`${PUBLIC}/a`))).rejects.toMatchObject({ status: 302 });

    const loop = () => new Response(null, { status: 302, headers: { location: "/again" } });
    stubFetch(loop(), loop(), loop(), loop());
    await expect(safeFetchText(new URL(`${PUBLIC}/a`))).rejects.toThrow(/Too many redirects/);
  });

  it("reports the upstream status of a failed request", async () => {
    stubFetch(new Response("expired", { status: 403 }));
    await expect(safeFetchText(new URL(`${PUBLIC}/a`))).rejects.toMatchObject({ name: "FetchError", status: 403 });
  });

  it("refuses responses that are too large", async () => {
    stubFetch(new Response("x", { status: 200, headers: { "content-length": String(9 * 1024 * 1024) } }));
    await expect(safeFetchText(new URL(`${PUBLIC}/a`))).rejects.toThrow(/too large/);

    stubFetch(new Response("x".repeat(8 * 1024 * 1024 + 1), { status: 200 }));
    await expect(safeFetchText(new URL(`${PUBLIC}/a`))).rejects.toThrow(/too large/);
  });
});
