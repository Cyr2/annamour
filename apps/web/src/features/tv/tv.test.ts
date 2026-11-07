import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { welcomePath } from "../account/AccountGate.tsx";
import { backTarget, pushBackHandler, runBackHandlers } from "./back.ts";
import { activeScope, focusablesIn, isFocusable, moveFocus, primaryIn, settleFocus } from "./focus-engine.ts";
import { isDirection, isEditable, remoteKey } from "./remote.ts";
import { type Box, distance, nextIndex } from "./spatial.ts";
import { decideTvMode, detectTvMode, notifyBackHandled, TV_STORAGE } from "./tv-mode.ts";

const ANDROID_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
const GOOGLE_TV = "Mozilla/5.0 (Linux; Android 12; Chromecast HD Build/STTE.230319.008; wv) GoogleTV Chrome/120.0";
const ANDROID_TV = "Mozilla/5.0 (Linux; Android 11; Formovie Build/RP1A; wv) AppleWebKit/537.36 Android TV Chrome/118";

describe("TV mode", () => {
  const signals = { search: "", userAgent: ANDROID_PHONE, bridge: undefined, remembered: false };

  it("turns on with ?tv=1 and remembers it, off with ?tv=0", () => {
    expect(decideTvMode({ ...signals, search: "?tv=1" })).toEqual({ tv: true, remember: "store" });
    expect(decideTvMode({ ...signals, search: "?tv=0", remembered: true })).toEqual({ tv: false, remember: "forget" });
    expect(decideTvMode({ ...signals, remembered: true })).toEqual({ tv: true, remember: "keep" });
  });

  it("recognises the Android TV app's bridge and TV browsers, not phones", () => {
    expect(decideTvMode({ ...signals, bridge: true }).tv).toBe(true);
    expect(decideTvMode({ ...signals, bridge: false }).tv).toBe(false);
    expect(decideTvMode({ ...signals, userAgent: GOOGLE_TV }).tv).toBe(true);
    expect(decideTvMode({ ...signals, userAgent: ANDROID_TV }).tv).toBe(true);
    expect(decideTvMode(signals).tv).toBe(false);
  });

  describe("in the browser", () => {
    afterEach(() => {
      localStorage.clear();
      window.history.replaceState(null, "", "/");
      delete window.AnnamourTV;
    });

    it("stores ?tv=1 for the next launches, validated when read back", () => {
      window.history.replaceState(null, "", "/?tv=1");
      expect(detectTvMode()).toBe(true);
      expect(localStorage.getItem(TV_STORAGE)).toBe("true");
      window.history.replaceState(null, "", "/");
      expect(detectTvMode()).toBe(true);
      localStorage.setItem(TV_STORAGE, '"yes"');
      expect(detectTvMode()).toBe(false);
      window.history.replaceState(null, "", "/?tv=0");
      localStorage.setItem(TV_STORAGE, "true");
      expect(detectTvMode()).toBe(false);
      expect(localStorage.getItem(TV_STORAGE)).toBeNull();
    });

    it("asks the bridge, and survives a broken one", () => {
      window.AnnamourTV = { isTv: () => true };
      expect(detectTvMode()).toBe(true);
      window.AnnamourTV = {
        isTv: () => {
          throw new Error("gone");
        },
      };
      expect(detectTvMode()).toBe(false);
    });

    it("tells the bridge when Retour was handled", () => {
      notifyBackHandled();
      const backHandled = vi.fn();
      window.AnnamourTV = { backHandled };
      notifyBackHandled();
      expect(backHandled).toHaveBeenCalledOnce();
      window.AnnamourTV = {
        backHandled: () => {
          throw new Error("gone");
        },
      };
      expect(() => notifyBackHandled()).not.toThrow();
    });
  });

  it("sends a guest TV to its pairing screen, keeping where it was going", () => {
    expect(welcomePath("/", true)).toBe("/tv/lier");
    expect(welcomePath("/s/ABCD", true)).toBe("/tv/lier?suite=%2Fs%2FABCD");
    expect(welcomePath("/tv#K7P2QX")).toBe("/bienvenue?suite=%2Ftv%23K7P2QX");
  });
});

describe("remote keys", () => {
  it("maps the D-pad, OK, Retour and play/pause", () => {
    expect(remoteKey("ArrowUp")).toBe("up");
    expect(remoteKey("ArrowRight")).toBe("right");
    expect(remoteKey("Enter")).toBe("ok");
    expect(remoteKey("Escape")).toBe("back");
    expect(remoteKey("GoBack")).toBe("back");
    expect(remoteKey(" ")).toBe("playPause");
    expect(remoteKey("MediaPlayPause")).toBe("playPause");
    expect(remoteKey("a")).toBeNull();
  });

  it("leaves Backspace to a text field", () => {
    expect(remoteKey("Backspace")).toBe("back");
    expect(remoteKey("Backspace", true)).toBeNull();
  });

  it("knows directions and editable fields", () => {
    expect(isDirection("left")).toBe(true);
    expect(isDirection("ok")).toBe(false);
    expect(isDirection(null)).toBe(false);
    const text = document.createElement("input");
    const range = document.createElement("input");
    range.type = "range";
    const readOnly = document.createElement("input");
    readOnly.readOnly = true;
    const area = document.createElement("textarea");
    expect(isEditable(text)).toBe(true);
    expect(isEditable(area)).toBe(true);
    expect(isEditable(range)).toBe(false);
    expect(isEditable(readOnly)).toBe(false);
    expect(isEditable(document.createElement("button"))).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
});

const box = (left: number, top: number, width = 100, height = 50): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe("spatial navigation", () => {
  // A keyboard: two rows of three keys, and a wide key under the first two.
  const keys = [box(0, 0), box(120, 0), box(240, 0), box(0, 70), box(120, 70), box(240, 70), box(0, 140, 220)];

  it("moves along a row and stops at its end", () => {
    expect(nextIndex(keys[0] as Box, keys, "right")).toBe(1);
    expect(nextIndex(keys[1] as Box, keys, "left")).toBe(0);
    expect(nextIndex(keys[2] as Box, keys, "right")).toBe(-1);
    expect(nextIndex(keys[0] as Box, keys, "up")).toBe(-1);
  });

  it("goes down to the item right under the focus", () => {
    expect(nextIndex(keys[1] as Box, keys, "down")).toBe(4);
    expect(nextIndex(keys[4] as Box, keys, "down")).toBe(6);
    expect(nextIndex(keys[6] as Box, keys, "up")).toBe(3);
  });

  it("prefers an item in line over a nearer one out of line", () => {
    const from = box(0, 0);
    const inLine = box(10, 400);
    const offLine = box(200, 150);
    expect(nextIndex(from, [offLine, inLine], "down")).toBe(1);
  });

  it("keeps ← → in the row, while ↑ reaches a corner button", () => {
    const cards = [box(0, 500, 300, 200), box(320, 500, 300, 200)];
    const corner = box(1600, 0, 200, 60);
    expect(nextIndex(cards[1] as Box, [...cards, corner], "right")).toBe(-1);
    expect(nextIndex(cards[1] as Box, [...cards, corner], "up")).toBe(2);
  });

  it("only counts what is ahead", () => {
    expect(distance(box(100, 0), box(0, 0), "right")).toBeNull();
    expect(distance(box(0, 0), box(150, 0), "right")).toBe(50);
    expect(distance(box(0, 100), box(0, 0), "up")).toBe(50);
  });
});

describe("Retour", () => {
  it("asks the innermost handler first, then the next", () => {
    const calls: string[] = [];
    const removeOuter = pushBackHandler(() => {
      calls.push("outer");
      return true;
    });
    const removeInner = pushBackHandler(() => {
      calls.push("inner");
      return false;
    });
    expect(runBackHandlers()).toBe(true);
    expect(calls).toEqual(["inner", "outer"]);
    removeInner();
    removeOuter();
    removeOuter();
    expect(runBackHandlers()).toBe(false);
  });

  it("goes home from any screen but the roots", () => {
    expect(backTarget("/rejoindre")).toBe("/");
    expect(backTarget("/s/ABCD")).toBe("/");
    expect(backTarget("/")).toBeNull();
    expect(backTarget("/tv/lier/")).toBeNull();
  });
});

/** Lays an element out at `rect`: happy-dom computes no layout. */
function place(element: Element, rect: Box): void {
  element.getBoundingClientRect = () =>
    ({ ...rect, x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }) as DOMRect;
}

function button(label: string, rect: Box, parent: Element = document.body): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = label;
  place(element, rect);
  parent.append(element);
  return element;
}

describe("focus engine", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("only lands on what is enabled, reachable, laid out and not inert", () => {
    const ok = button("ok", box(0, 0));
    const disabled = button("off", box(0, 60));
    disabled.disabled = true;
    const skipped = button("skip", box(0, 120));
    skipped.tabIndex = -1;
    const collapsed = button("none", box(0, 0, 0, 0));
    const wrapper = document.createElement("div");
    wrapper.setAttribute("inert", "");
    document.body.append(wrapper);
    const inert = button("inert", box(0, 180), wrapper);
    expect(isFocusable(ok)).toBe(true);
    expect([disabled, skipped, collapsed, inert].some(isFocusable)).toBe(false);
    expect(isFocusable(document.createElementNS("http://www.w3.org/2000/svg", "svg"))).toBe(false);
    expect(focusablesIn(document.body)).toEqual([ok]);
  });

  it("keeps the focus inside an open dialog", () => {
    button("page", box(0, 0));
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    const inside = button("inside", box(0, 300), dialog);
    expect(activeScope()).toBe(dialog);
    expect(focusablesIn(activeScope())).toEqual([inside]);
  });

  it("starts on the highest-ranked main action", () => {
    const first = button("first", box(0, 0));
    const join = document.createElement("div");
    join.setAttribute("data-tv-primary", "");
    document.body.append(join);
    const joinButton = button("join", box(0, 100), join);
    expect(primaryIn(document.body)).toBe(joinButton);
    const resume = button("resume", box(0, 200));
    resume.setAttribute("data-tv-primary", "2");
    expect(primaryIn(document.body)).toBe(resume);
    resume.disabled = true;
    expect(primaryIn(document.body)).toBe(joinButton);
    join.remove();
    expect(primaryIn(document.body)).toBeNull();
    expect(first).toBeDefined();
  });

  it("moves the real focus with the arrows", () => {
    const left = button("left", box(0, 0));
    const right = button("right", box(200, 0));
    const below = button("below", box(0, 100));
    expect(moveFocus("down")).toBe(true);
    expect(document.activeElement).toBe(left);
    expect(moveFocus("right")).toBe(true);
    expect(document.activeElement).toBe(right);
    expect(moveFocus("right")).toBe(false);
    expect(moveFocus("down")).toBe(true);
    expect(document.activeElement).toBe(below);
  });

  it("starts nowhere when the screen has nothing to focus", () => {
    expect(moveFocus("down")).toBe(false);
  });

  it("follows the main action until the remote is used, then only rescues a lost focus", () => {
    const other = button("other", box(0, 0));
    const main = button("main", box(0, 100));
    main.setAttribute("data-tv-primary", "");
    settleFocus(false);
    expect(document.activeElement).toBe(main);
    other.focus();
    settleFocus(true);
    expect(document.activeElement).toBe(other);
    other.remove();
    settleFocus(true);
    expect(document.activeElement).toBe(main);
    main.removeAttribute("data-tv-primary");
    main.remove();
    const last = button("last", box(0, 0));
    settleFocus(true);
    expect(document.activeElement).toBe(last);
  });
});
