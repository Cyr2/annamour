import { describe, expect, it } from "vitest";
import { isTouchLinkMenu } from "./native-feel.ts";

/** A context menu opened on `target`, by the given pointer (none: an older browser that doesn't say). */
function menuOn(target: Element, pointerType?: string): Event {
  const event = new Event("contextmenu", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "target", { value: target });
  if (pointerType !== undefined) Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
}

function linkIcon(): Element {
  const link = document.createElement("a");
  link.href = "/profil";
  const icon = document.createElement("span");
  link.append(icon);
  return icon;
}

describe("long press on a touch screen", () => {
  it("opens no browser menu on a link, even pressed on its icon", () => {
    expect(isTouchLinkMenu(menuOn(linkIcon(), "touch"), true)).toBe(true);
    expect(isTouchLinkMenu(menuOn(document.createElement("button"), "touch"), true)).toBe(true);
  });

  it("keeps a field's menu, to paste", () => {
    expect(isTouchLinkMenu(menuOn(document.createElement("input"), "touch"), true)).toBe(false);
  });

  it("leaves a mouse's right click alone, even on a link", () => {
    expect(isTouchLinkMenu(menuOn(linkIcon(), "mouse"), false)).toBe(false);
  });

  it("trusts the screen when the browser doesn't name the pointer", () => {
    expect(isTouchLinkMenu(menuOn(linkIcon()), true)).toBe(true);
    expect(isTouchLinkMenu(menuOn(linkIcon()), false)).toBe(false);
  });
});
