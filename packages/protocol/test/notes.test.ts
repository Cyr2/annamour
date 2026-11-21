import { describe, expect, it } from "vitest";
import { parseClientMessage } from "../src/messages.ts";
import { acceptNote, cleanNote, NOTE_COOLDOWN_MS, NOTE_MAX_LENGTH } from "../src/notes.ts";

const paused = { status: "paused", readying: false, lastNoteAt: -Infinity, now: 10_000 } as const;

describe("a short note while the film is paused", () => {
  it("is sent as one clean line", () => {
    expect(acceptNote("  on reprend   après le thé ?  ", paused)).toBe("on reprend après le thé ?");
  });

  it("loses newlines, escapes and bidi overrides, but keeps emoji sequences", () => {
    expect(cleanNote(`coucou\n\u001b[31mtoi${String.fromCharCode(0x202e)}`)).toBe("coucou [31mtoi");
    expect(cleanNote("👩‍❤️‍👨 ce soir")).toBe("👩‍❤️‍👨 ce soir");
  });

  it("is refused while the film plays, or while it is about to start", () => {
    expect(acceptNote("chut", { ...paused, status: "playing" })).toBeNull();
    expect(acceptNote("chut", { ...paused, readying: true })).toBeNull();
  });

  it("is refused when nothing is left to say", () => {
    expect(acceptNote(" \n\t ", paused)).toBeNull();
  });

  it("waits a little between two notes from the same person", () => {
    const lastNoteAt = paused.now - NOTE_COOLDOWN_MS + 1;
    expect(acceptNote("encore", { ...paused, lastNoteAt })).toBeNull();
    expect(acceptNote("encore", { ...paused, lastNoteAt: lastNoteAt - 1 })).toBe("encore");
  });

  it("is refused by the protocol beyond its length", () => {
    expect(parseClientMessage(JSON.stringify({ type: "note", text: "a".repeat(NOTE_MAX_LENGTH) }))).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "note", text: "a".repeat(NOTE_MAX_LENGTH + 1) }))).toBeNull();
  });
});
