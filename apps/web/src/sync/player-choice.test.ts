import { beforeEach, describe, expect, it } from "vitest";
import { offersPlayerChoice, playerChoice, rememberPlayerChoice, setPlayerChoice } from "./player-choice.ts";

beforeEach(() => localStorage.clear());

describe("which player an Apple device uses", () => {
  it("is Safari's own until another one is chosen, away from an iPad", () => {
    expect(playerChoice()).toBe("safari");
  });

  it("is ours by default on an iPad, unless Safari's was chosen there", () => {
    const iPad = () => true;
    expect(playerChoice(iPad)).toBe("annamour");
    setPlayerChoice("safari");
    expect(playerChoice(iPad)).toBe("safari");
  });

  it("remembers our player once opened with ?lecteur=annamour, and Safari's again with ?lecteur=safari", () => {
    rememberPlayerChoice("?lecteur=annamour");
    expect(playerChoice()).toBe("annamour");
    rememberPlayerChoice("?code=AXNA");
    expect(playerChoice()).toBe("annamour");
    rememberPlayerChoice("?lecteur=safari");
    expect(playerChoice()).toBe("safari");
  });

  it("ignores anything else in the address", () => {
    rememberPlayerChoice("?lecteur=vlc");
    expect(playerChoice()).toBe("safari");
  });

  it("is switched from the profile too, for the app installed on the home screen", () => {
    setPlayerChoice("annamour");
    expect(playerChoice()).toBe("annamour");
  });
});

describe("where there is a player to choose", () => {
  const device = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints }) as Navigator;
  const withMse = { MediaSource: class {} } as unknown as typeof globalThis;

  it("is an iPad (which says it is a Mac, with touch), with its full Media Source", () => {
    expect(offersPlayerChoice(device("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)"), withMse)).toBe(true);
    expect(offersPlayerChoice(device("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), withMse)).toBe(true);
  });

  it("is not an iPhone, whose managed Media Source keeps no more lead than Safari, nor anything else", () => {
    const managedOnly = { ManagedMediaSource: class {} } as unknown as typeof globalThis;
    expect(offersPlayerChoice(device("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"), managedOnly)).toBe(false);
    expect(offersPlayerChoice(device("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), withMse)).toBe(false);
    expect(offersPlayerChoice(device("Mozilla/5.0 (Linux; Android 14)"), withMse)).toBe(false);
  });
});
