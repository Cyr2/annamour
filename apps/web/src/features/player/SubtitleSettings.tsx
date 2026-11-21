import type { Media } from "@annamour/protocol";
import { useId } from "react";
import { Button } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import {
  formatOffset,
  SUBTITLE_OFFSET_MAX,
  SUBTITLE_SIZES,
  steppedOffset,
  useSubtitleSize,
} from "./subtitle-settings.ts";
import { TrackChoice } from "./TrackPickers.tsx";
import { choiceFor, chooseTracks, useTrackChoices } from "./track-choice.ts";

interface SubtitleSettingsProps {
  code: string;
  media: Pick<Media, "audio" | "subtitles">;
  /** YouTube's captions keep their own timing. */
  canShift: boolean;
}

/** Size (this device) and timing (this séance) of the subtitles shown, for this person only. */
export function SubtitleSettings({ code, media, canShift }: SubtitleSettingsProps) {
  const size = useSubtitleSize((s) => s.size);
  const setSize = useSubtitleSize((s) => s.setSize);
  const byRoom = useTrackChoices((s) => s.byRoom);
  const choice = choiceFor(byRoom, code, media);
  if (!choice.subtitles) return null;

  return (
    <>
      <Field label="Taille">
        <TrackChoice
          label="Taille"
          items={SUBTITLE_SIZES}
          value={size}
          onValueChange={(value) => {
            const picked = SUBTITLE_SIZES.find((item) => item.value === value);
            if (picked) setSize(picked.value);
          }}
        />
      </Field>
      {canShift ? (
        <OffsetStepper
          offset={choice.subtitleOffset}
          onChange={(subtitleOffset) => chooseTracks(code, media, { subtitleOffset })}
        />
      ) : null}
    </>
  );
}

function OffsetStepper({ offset, onChange }: { offset: number; onChange: (offset: number) => void }) {
  const hintId = useId();
  return (
    <Field label="Décalage">
      <fieldset aria-describedby={hintId} className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Décalage</legend>
        <Button disabled={offset <= -SUBTITLE_OFFSET_MAX} onClick={() => onChange(steppedOffset(offset, -1))}>
          {"−0,5 s"}
        </Button>
        <output aria-live="polite" className="min-w-16 text-center font-rounded-tight font-extrabold tabular-nums">
          {formatOffset(offset)}
        </output>
        <Button disabled={offset >= SUBTITLE_OFFSET_MAX} onClick={() => onChange(steppedOffset(offset, 1))}>
          {"+0,5 s"}
        </Button>
        <Button disabled={offset === 0} onClick={() => onChange(0)}>
          Remettre à zéro
        </Button>
      </fieldset>
      <p id={hintId} className="text-sm text-fg-muted">
        Moins s'ils arrivent trop tard, plus s'ils arrivent trop tôt.
      </p>
    </Field>
  );
}
