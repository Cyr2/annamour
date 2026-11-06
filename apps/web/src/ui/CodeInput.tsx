import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@annamour/protocol";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { exit, shakeKeyframes, shakeTransition, spring } from "../lib/motion.ts";
import { cx } from "./cx.ts";

interface CodeInputProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Called once all letters are in. */
  onComplete?: (code: string) => void;
  /** A message to show under the cells; setting one shakes them. */
  error?: string | null;
  label: string;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Room code entry, one cell per letter. A single real input sits over the
 * cells, so typing, pasting, autofill and screen readers all just work.
 */
export function CodeInput({
  value,
  onValueChange,
  onComplete,
  error = null,
  label,
  autoFocus,
  className,
}: CodeInputProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    if (!error || reduceMotion || !scope.current) return;
    animate(scope.current, { x: shakeKeyframes }, shakeTransition);
  }, [error, reduceMotion, animate, scope]);

  const handleChange = (raw: string) => {
    const next = normalizeRoomCode(raw);
    if (next === value) return;
    onValueChange(next);
    if (next.length === ROOM_CODE_LENGTH) onComplete?.(next);
  };

  const active = Math.min(value.length, ROOM_CODE_LENGTH - 1);
  const errorId = `${id}-error`;

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-fg-muted">
        {label}
      </label>
      <div ref={scope} className="relative w-fit">
        <div className="flex gap-2.5" aria-hidden>
          {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => {
            const char = value[i];
            const isActive = focused && i === active;
            return (
              <div
                key={i}
                className={cx(
                  "relative grid h-16 w-14 place-items-center rounded-control border-2 bg-surface transition-colors duration-200",
                  error ? "border-danger" : isActive ? "border-accent" : char ? "border-line-strong" : "border-line",
                )}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {char ? (
                    <motion.span
                      key={char + i}
                      className="font-rounded-tight text-[1.75rem] leading-none font-extrabold text-fg"
                      initial={{ y: 10, scale: 0.5, opacity: 0 }}
                      animate={{ y: 0, scale: 1, opacity: 1, transition: spring.snappy }}
                      exit={{ scale: 0.6, opacity: 0, transition: exit.fade }}
                    >
                      {char}
                    </motion.span>
                  ) : isActive ? (
                    <motion.span
                      key="caret"
                      className="h-7 w-0.5 rounded-full bg-accent"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [1, 1, 0, 0] }}
                      transition={{ duration: 1.1, times: [0, 0.5, 0.55, 1], repeat: Infinity }}
                    />
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
        <input
          id={id}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            const end = e.target.value.length;
            e.target.setSelectionRange(end, end);
          }}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          maxLength={ROOM_CODE_LENGTH + 8 /* room for pasted spaces/dashes */}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          // Invisible but real: 16px so iOS doesn't zoom; transparent caret.
          className="absolute inset-0 h-full w-full cursor-text rounded-control bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        />
      </div>
      <p id={errorId} role="alert" className="min-h-5 text-sm text-danger">
        {error ?? ""}
      </p>
    </div>
  );
}
