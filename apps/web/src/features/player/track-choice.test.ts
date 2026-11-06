import type { Media } from "@annamour/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import {
  choiceFor,
  chooseTracks,
  defaultChoice,
  defaultSubtitles,
  describeAudio,
  useTrackChoices,
} from "./track-choice.ts";

const media: Pick<Media, "audio" | "subtitles"> = {
  audio: [
    { id: "p0", label: "Français", language: "fr" },
    { id: "p1", label: "English", language: "en" },
  ],
  subtitles: [
    { id: "subs_fre", label: "Français", language: "fr", url: "/a.vtt", forced: false },
    { id: "subs_fre_forced", label: "Français", language: "fr", url: "/b.vtt", forced: true },
  ],
};

beforeEach(() => useTrackChoices.setState({ byRoom: {} }));

describe("track choice", () => {
  it("starts on the first language with forced French subtitles", () => {
    expect(defaultSubtitles(media.subtitles)).toBe("subs_fre_forced");
    expect(defaultSubtitles([])).toBeNull();
    expect(defaultChoice(media)).toEqual({ audio: "p0", subtitles: "subs_fre_forced" });
  });

  it("remembers a personal choice per séance, without touching the others", () => {
    chooseTracks("YWEK", media, { subtitles: null });
    chooseTracks("YWEK", media, { audio: "p1" });
    const { byRoom } = useTrackChoices.getState();
    expect(choiceFor(byRoom, "YWEK", media)).toEqual({ audio: "p1", subtitles: null });
    expect(choiceFor(byRoom, "QHMP", media)).toEqual(defaultChoice(media));
  });

  it("summarises the audio for the « C'est prêt » card", () => {
    expect(describeAudio(media)).toBe("2 langues");
    expect(describeAudio({ audio: [{ id: "p0", label: "Français" }] })).toBe("Français");
    expect(describeAudio({ audio: [] })).toBeNull();
  });
});
