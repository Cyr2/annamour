import type { Media } from "@annamour/protocol";
import type { CSSProperties } from "react";
import { ChoiceRow } from "../../ui/ChoiceRow.tsx";
import { SegmentedControl } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { choiceFor, chooseTracks, subtitleLabel, useTrackChoices } from "./track-choice.ts";

const NO_SUBTITLES = "none";

/** Wide enough for « Français (forcés) ». */
const SEGMENT_STYLE = { "--lg-tab-width": "7.75rem", "--lg-tab-height": "2.5rem" } as CSSProperties;
/**
 * Beyond two options a segmented control outgrows a phone held upright, and
 * scrolling it sideways is impossible: a touch held on it moves its lens instead.
 */
const SEGMENTED_MAX = 2;

interface TrackChoiceProps {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
}

/** Two options side by side; more, one per row, all in view. */
function TrackChoice({ label, items, value, onValueChange }: TrackChoiceProps) {
  if (items.length <= SEGMENTED_MAX) {
    return (
      <SegmentedControl
        aria-label={label}
        style={SEGMENT_STYLE}
        items={items}
        value={value}
        onValueChange={onValueChange}
      />
    );
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">{label}</legend>
      {items.map((item) => (
        <ChoiceRow
          key={item.value}
          name={label}
          label={item.label}
          checked={item.value === value}
          onSelect={() => onValueChange(item.value)}
        />
      ))}
    </fieldset>
  );
}

/** Audio language and subtitles for this person only. */
export function TrackPickers({ code, media }: { code: string; media: Pick<Media, "audio" | "subtitles"> }) {
  const byRoom = useTrackChoices((s) => s.byRoom);
  const choice = choiceFor(byRoom, code, media);

  return (
    <>
      {media.audio.length > 1 ? (
        <Field label="Langue">
          <TrackChoice
            label="Langue"
            items={media.audio.map((a) => ({ value: a.id, label: a.label }))}
            value={choice.audio ?? ""}
            onValueChange={(audio) => chooseTracks(code, media, { audio })}
          />
        </Field>
      ) : null}
      <Field label="Sous-titres">
        {media.subtitles.length ? (
          <TrackChoice
            label="Sous-titres"
            items={[
              { value: NO_SUBTITLES, label: "Aucun" },
              ...media.subtitles.map((s) => ({ value: s.id, label: subtitleLabel(s) })),
            ]}
            value={choice.subtitles ?? NO_SUBTITLES}
            onValueChange={(value) => chooseTracks(code, media, { subtitles: value === NO_SUBTITLES ? null : value })}
          />
        ) : (
          <p className="text-sm text-fg-muted">Pas de sous-titres pour cette vidéo.</p>
        )}
      </Field>
    </>
  );
}
