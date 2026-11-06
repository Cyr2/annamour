/**
 * Our thin layer over glisse (Liquid Glass). The app imports controls from
 * here, never from glisse, so defaults and fixes live in one place.
 */
import {
  Button as GlisseButton,
  type ButtonProps as GlisseButtonProps,
  Glass as GlisseGlass,
  type GlassProps as GlisseGlassProps,
  Input as GlisseInput,
  type InputProps as GlisseInputProps,
  Menu as GlisseMenu,
  SegmentedControl as GlisseSegmentedControl,
  Slider as GlisseSlider,
  Switch as GlisseSwitch,
  type MenuProps,
  type SegmentedControlProps,
  type SliderProps,
  type SwitchProps,
} from "glisse";
import type { Ref } from "react";
import { cx } from "./cx.ts";

export type { MenuEntry, MenuItem, SegmentedControlItem } from "glisse";

/* ---------- Button ---------- */

export interface ButtonProps extends Omit<GlisseButtonProps, "variant" | "tint" | "destructive"> {
  /** `filled` is the one primary action of a view (the thread colour); `glass` everything else. */
  variant?: "filled" | "glass";
  /** `regular` is 44px (the touch minimum), `large` 52px for a screen's main call to action. */
  size?: "regular" | "large";
  /** `destructive` for actions that end or delete something. */
  tone?: "default" | "destructive";
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "glass",
  size = "regular",
  tone = "default",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <GlisseButton
      {...props}
      type={type}
      variant={variant}
      destructive={tone === "destructive"}
      data-size={size}
      className={cx("am-button", className)}
    />
  );
}

/* ---------- Glass ---------- */

export function Glass({ ref, ...props }: GlisseGlassProps & { ref?: Ref<HTMLDivElement> }) {
  return <GlisseGlass ref={ref} {...props} />;
}

/* ---------- Input ---------- */

export function Input({ className, ref, ...props }: GlisseInputProps & { ref?: Ref<HTMLInputElement> }) {
  return <GlisseInput ref={ref} {...props} className={cx("am-input", className)} />;
}

/* ---------- Switch, Slider, SegmentedControl, Menu ---------- */

export function Switch({ ref, ...props }: SwitchProps & { ref?: Ref<HTMLButtonElement> }) {
  return <GlisseSwitch ref={ref} {...props} />;
}

export function Slider({ ref, ...props }: SliderProps & { ref?: Ref<HTMLInputElement> }) {
  return <GlisseSlider ref={ref} {...props} />;
}

export function SegmentedControl(props: SegmentedControlProps) {
  return <GlisseSegmentedControl {...props} />;
}

export function Menu({ align = "end", ...props }: MenuProps) {
  return <GlisseMenu align={align} {...props} />;
}
