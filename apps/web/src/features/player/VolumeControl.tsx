import { Volume2, VolumeX } from "lucide-react";
import { Slider } from "../../ui/controls.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { audibleLevel, supportsVolumeControl, useVolume } from "./volume.ts";

// Probed once: iPhone/iPad Safari ignore a scripted volume, so only mute is offered there.
const canSetVolume = typeof document !== "undefined" && supportsVolumeControl();

/** Personal volume: mute button, plus a slider where the browser allows it. */
export function VolumeControl() {
  const level = useVolume((s) => audibleLevel(s));
  const setLevel = useVolume((s) => s.setLevel);
  const toggleMute = useVolume((s) => s.toggleMute);
  const silent = level === 0;

  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        label={silent ? "Remettre le son" : "Couper le son"}
        icon={silent ? <VolumeX /> : <Volume2 />}
        onClick={toggleMute}
      />
      {canSetVolume ? (
        <Slider
          aria-label="Volume"
          aria-valuetext={silent ? "Son coupé" : `${Math.round(level * 100)} %`}
          min={0}
          max={1}
          step={0.05}
          value={level}
          onValueChange={setLevel}
          className="mr-1.5 hidden w-24 sm:block"
        />
      ) : null}
    </div>
  );
}
