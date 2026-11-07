import { describe, expect, it, vi } from "vitest";
import { keepScreenAwake } from "./screen-awake.ts";

function host({ visible = true, refuse = false } = {}) {
  const released = vi.fn(async () => {});
  let listener = () => {};
  const state = { visible, requests: 0 };
  return {
    state,
    released,
    showAgain: () => {
      state.visible = true;
      listener();
    },
    host: {
      request: () => {
        state.requests++;
        return refuse ? Promise.reject(new Error("NotAllowedError")) : Promise.resolve({ release: released });
      },
      visible: () => state.visible,
      onVisibility: (next: () => void) => {
        listener = next;
        return () => {
          listener = () => {};
        };
      },
    },
  };
}

describe("keeping the screen on while a film is open", () => {
  it("holds it until the film is closed, then lets go", async () => {
    const h = host();
    const stop = keepScreenAwake(h.host);
    await vi.waitFor(() => expect(h.state.requests).toBe(1));
    await Promise.resolve();
    stop();
    expect(h.released).toHaveBeenCalledTimes(1);
  });

  it("asks again when the page comes back, the system having let go while hidden", async () => {
    const h = host({ visible: false });
    keepScreenAwake(h.host);
    expect(h.state.requests).toBe(0);
    h.showAgain();
    expect(h.state.requests).toBe(1);
  });

  it("lets go at once of a lock granted after the film was closed", async () => {
    const h = host();
    const stop = keepScreenAwake(h.host);
    stop();
    await vi.waitFor(() => expect(h.released).toHaveBeenCalledTimes(1));
  });

  it("does nothing when refused or unsupported", async () => {
    const refused = host({ refuse: true });
    expect(() => keepScreenAwake(refused.host)()).not.toThrow();
    const none = { request: () => undefined, visible: () => true, onVisibility: () => () => {} };
    expect(() => keepScreenAwake(none)()).not.toThrow();
  });
});
