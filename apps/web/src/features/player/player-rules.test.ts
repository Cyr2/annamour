import type { Member, PlaybackState, RoomChange } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { describePlaybackEvent, describeRoomChange } from "./playback-notice.ts";
import { tapToggles } from "./player-keys.ts";
import { audibleLevel, supportsVolumeControl, toggledMute, useVolume, withLevel } from "./volume.ts";

const anna: Member = { id: "m2", name: "Anna", color: "lilac", buffering: false };
const paused = (position: number, at = 0): PlaybackState => ({ status: "paused", position, at });
const playing = (position: number, at = 0): PlaybackState => ({ status: "playing", position, at });
const base = { members: [anna], you: "m1" };

describe("notices of what someone does to the séance's episodes", () => {
  const episodes = [{}, { label: "S1 · É2" }, { label: "Alien" }, {}];
  const change = (c: RoomChange, by: string | undefined = "m2") =>
    describeRoomChange({ ...base, change: c, by, episodes, current: 1 });

  it("names who started an episode, said « Pas ce soir », added or removed one", () => {
    expect(change({ kind: "episode" })).toMatchObject({ message: "Anna a lancé S1 · É2", member: anna });
    expect(change({ kind: "declined" })?.message).toBe("Anna a dit « Pas ce soir »");
    expect(change({ kind: "added", episode: 2 })?.message).toBe("Anna a ajouté Alien à la file");
    expect(change({ kind: "removed", episode: 2, label: "S1 · É4" })?.message).toBe("Anna a retiré S1 · É4 de la file");
  });

  it("names an episode without a label by its place", () => {
    expect(change({ kind: "added", episode: 3 })?.message).toBe("Anna a ajouté l'épisode 4 à la file");
    expect(change({ kind: "removed", episode: 2 })?.message).toBe("Anna a retiré l'épisode 3 de la file");
  });

  it("says « Quelqu'un » for someone who already left", () => {
    expect(change({ kind: "declined" }, "m9")?.message).toBe("Quelqu'un a dit « Pas ce soir »");
  });

  it("stays quiet about my own changes and those the séance made by itself", () => {
    expect(change({ kind: "declined" }, "m1")).toBeNull();
    const byNobody = { ...base, change: { kind: "episode" } as const, by: undefined, episodes, current: 1 };
    expect(describeRoomChange(byNobody)).toBeNull();
    expect(describeRoomChange({ ...base, change: undefined, by: "m2", episodes, current: 1 })).toBeNull();
  });
});

describe("playback notices", () => {
  it("names who paused or relaunched the film", () => {
    expect(
      describePlaybackEvent({ ...base, action: "pause", by: "m2", previous: playing(10), next: paused(12) }),
    ).toMatchObject({
      kind: "pause",
      message: "Anna a mis en pause",
      member: anna,
    });
    expect(
      describePlaybackEvent({ ...base, action: "play", by: "m2", previous: paused(12), next: playing(12) })?.message,
    ).toBe("Anna a relancé le film");
  });

  it("stays quiet about my own actions and about waits", () => {
    expect(describePlaybackEvent({ ...base, action: "pause", by: "m1", previous: null, next: paused(1) })).toBeNull();
    expect(describePlaybackEvent({ ...base, action: "wait", by: "m2", previous: null, next: paused(1) })).toBeNull();
    expect(
      describePlaybackEvent({ ...base, action: "play", by: undefined, previous: null, next: playing(1) }),
    ).toBeNull();
  });

  it("celebrates the end of a wait", () => {
    expect(
      describePlaybackEvent({ ...base, action: "resume", by: undefined, previous: paused(5), next: playing(5, 4000) })
        ?.message,
    ).toBe("C'est reparti");
  });

  it("says nothing when the wait was too short to notice, like a jump inside what was downloaded", () => {
    expect(
      describePlaybackEvent({
        ...base,
        action: "resume",
        by: undefined,
        previous: paused(600, 10_000),
        next: playing(600, 10_200),
      }),
    ).toBeNull();
  });

  it("says how far a short seek went, and where a long one landed", () => {
    // Playing from 100 at t=0; 2 s later Anna jumps to 112: 10 s ahead of where we were.
    const forward = describePlaybackEvent({
      ...base,
      action: "seek",
      by: "m2",
      previous: playing(100, 0),
      next: playing(112, 2000),
    });
    expect(forward).toMatchObject({ kind: "forward", message: "Anna a avancé de 10 s" });
    expect(
      describePlaybackEvent({ ...base, action: "seek", by: "m2", previous: paused(100), next: paused(90) })?.message,
    ).toBe("Anna a reculé de 10 s");
    expect(
      describePlaybackEvent({ ...base, action: "seek", by: "m2", previous: paused(100), next: paused(4360) })?.message,
    ).toBe("Anna a avancé à 1:12:40");
  });

  it("tells a jump that makes everyone wait as a jump, never as a pause", () => {
    const notice = describePlaybackEvent({
      ...base,
      action: "seek",
      by: "m2",
      previous: playing(100, 0),
      next: paused(3700, 2000),
    });
    expect(notice).toMatchObject({ kind: "forward", message: "Anna a avancé à 1:01:40" });
  });

  it("ignores tiny corrections and unknown people still get a name", () => {
    expect(
      describePlaybackEvent({ ...base, action: "seek", by: "m2", previous: paused(100), next: paused(100.4) }),
    ).toBeNull();
    expect(
      describePlaybackEvent({ ...base, action: "pause", by: "m9", previous: null, next: paused(1) })?.message,
    ).toBe("Quelqu'un a mis en pause");
    expect(describePlaybackEvent({ ...base, action: "seek", by: "m2", previous: null, next: paused(1) })).toBeNull();
  });
});

describe("volume", () => {
  it("mutes without forgetting the level", () => {
    const muted = toggledMute({ level: 0.4, muted: false });
    expect(muted).toEqual({ level: 0.4, muted: true });
    expect(audibleLevel(muted)).toBe(0);
    expect(toggledMute(muted)).toEqual({ level: 0.4, muted: false });
  });

  it("treats the slider at zero as muted, and unmuting brings sound back", () => {
    const silent = withLevel({ level: 0.5, muted: false }, 0);
    expect(silent).toEqual({ level: 0, muted: true });
    expect(toggledMute(silent)).toEqual({ level: 0.6, muted: false });
    expect(withLevel(silent, 0.3)).toEqual({ level: 0.3, muted: false });
  });

  it("clamps the level", () => {
    expect(withLevel({ level: 0.5, muted: false }, 4).level).toBe(1);
    expect(withLevel({ level: 0.5, muted: false }, Number.NaN).level).toBe(0.5);
  });

  it("detects devices that ignore a scripted volume (iPhone, iPad)", () => {
    const ios = { volume: 1 } as HTMLMediaElement;
    Object.defineProperty(ios, "volume", { get: () => 1, set: () => {} });
    expect(supportsVolumeControl(() => ios)).toBe(false);
    expect(supportsVolumeControl(() => ({ volume: 1 }) as HTMLMediaElement)).toBe(true);
    expect(
      supportsVolumeControl(() => {
        throw new Error("no media");
      }),
    ).toBe(false);
  });

  it("remembers the choice on this device", () => {
    useVolume.getState().setLevel(0.25);
    useVolume.getState().toggleMute();
    expect(useVolume.getState()).toMatchObject({ level: 0.25, muted: true });
    expect(JSON.parse(localStorage.getItem("annamour:volume:v1") ?? "{}")).toEqual({ level: 0.25, muted: true });
  });
});

describe("a tap on the film", () => {
  const onFilm = { onSurface: true, controlsHidden: false };

  it("plays or pauses for everyone when the controls are in sight", () => {
    expect(tapToggles(onFilm, true)).toBe(true);
  });

  it("only brings the hidden controls back, without pausing anyone", () => {
    expect(tapToggles({ ...onFilm, controlsHidden: true }, true)).toBe(false);
  });

  it("ignores a drag that began on a control or ended off the film", () => {
    expect(tapToggles({ ...onFilm, onSurface: false }, true)).toBe(false);
    expect(tapToggles(onFilm, false)).toBe(false);
  });
});
