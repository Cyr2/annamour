import type { Media } from "@annamour/protocol";
import type { CSSProperties } from "react";
import { SegmentedControl } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { choiceFor, chooseTracks, useTrackChoices } from "./track-choice.ts";

const NO_SUBTITLES = "none";

/** Wide enough for "Français" or "Forcés"; the control scrolls if a film has many tracks. */
const SEGMENT_STYLE = { "--lg-tab-width": "7.25rem", "--lg-tab-height": "40px" } as CSSProperties;

function subtitleLabel(track: Media["subtitles"][number]): string {
  return track.forced ? `${track.label} (forcés)` : track.label;
}

/** Audio language and subtitles for this person only. */
export function TrackPickers({ code, media }: { code: string; media: Pick<Media, "audio" | "subtitles"> }) {
  const byRoom = useTrackChoices((s) => s.byRoom);
  const choice = choiceFor(byRoom, code, media);

  return (
    <>
      {media.audio.length > 1 ? (
        <Field label="Langue">
          <div className="overflow-x-auto">
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
          <div className="overflow-x-auto">
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
