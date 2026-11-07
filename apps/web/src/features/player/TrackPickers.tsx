import type { Media } from "@annamour/protocol";
import type { CSSProperties } from "react";
import { SegmentedControl } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { choiceFor, chooseTracks, subtitleLabel, useTrackChoices } from "./track-choice.ts";

const NO_SUBTITLES = "none";

/*
 * The row scrolls sideways when a film has many tracks. A scroller clips what
 * overflows it, so it carries padding (cancelled by negative margins) wide
 * and tall enough for the segmented control's lens, which swells past the
 * control while held.
 */
const SCROLLER = "-mx-4 -my-3.5 overflow-x-auto px-4 py-3.5";

/** Wide enough for « Français (forcés) »; the control scrolls if a film has many tracks. */
const SEGMENT_STYLE = { "--lg-tab-width": "7.75rem", "--lg-tab-height": "2.5rem" } as CSSProperties;

/** Audio language and subtitles for this person only. */
export function TrackPickers({ code, media }: { code: string; media: Pick<Media, "audio" | "subtitles"> }) {
  const byRoom = useTrackChoices((s) => s.byRoom);
  const choice = choiceFor(byRoom, code, media);

  return (
    <>
      {media.audio.length > 1 ? (
        <Field label="Langue">
          <div className={SCROLLER}>
            <SegmentedControl
              aria-label="Langue"
              style={SEGMENT_STYLE}
              items={media.audio.map((a) => ({ value: a.id, label: a.label }))}
              value={choice.audio}
              onValueChange={(audio) => chooseTracks(code, media, { audio })}
            />
          </div>
        </Field>
      ) : null}
      <Field label="Sous-titres">
        {media.subtitles.length ? (
          <div className={SCROLLER}>
            <SegmentedControl
              aria-label="Sous-titres"
              style={SEGMENT_STYLE}
              items={[
                { value: NO_SUBTITLES, label: "Aucun" },
                ...media.subtitles.map((s) => ({ value: s.id, label: subtitleLabel(s) })),
              ]}
              value={choice.subtitles ?? NO_SUBTITLES}
              onValueChange={(value) => chooseTracks(code, media, { subtitles: value === NO_SUBTITLES ? null : value })}
            />
          </div>
        ) : (
          <p className="text-sm text-fg-muted">Ce film n'a pas de sous-titres.</p>
        )}
      </Field>
    </>
  );
}
