import { REACTIONS, type Reaction } from "@annamour/protocol";
import { Smile } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { spring } from "../../lib/motion.ts";
import { createReactionThrottle } from "../../sync/reactions.ts";
import { Glass } from "../../ui/controls.tsx";
import { IconButton } from "../../ui/IconButton.tsx";

const LABELS: Record<Reaction, string> = {
  "❤️": "Cœur",
  "😂": "Rire",
  "😮": "Surprise",
  "😭": "Larmes",
  "🔥": "Feu",
  "🍿": "Popcorn",
};

interface ReactionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReact: (emoji: Reaction) => void;
}

/** Six reactions in a glass pop; it stays open to send a few in a row. */
export function ReactionPicker({ open, onOpenChange, onReact }: ReactionPickerProps) {
  const root = useRef<HTMLDivElement>(null);
  const allowed = useMemo(() => createReactionThrottle(), []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={root} className="relative">
      <IconButton
        label="Envoyer une réaction"
        icon={<Smile />}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={open ? "bg-fill-hover" : undefined}
      />
      <AnimatePresence>
        {open ? (
          <motion.div
            className="absolute right-[-10px] bottom-[58px] origin-bottom-right"
            initial={{ opacity: 0, y: 10, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring.ui }}
            exit={{ opacity: 0, y: 6, scale: 0.94, transition: { duration: 0.16 } }}
          >
            <Glass role="menu" aria-label="Réactions" className="flex gap-0.5 rounded-pill p-1.5 shadow-float">
              {REACTIONS.map((emoji, index) => (
                <motion.button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  aria-label={LABELS[emoji]}
                  className="grid size-[46px] place-items-center rounded-full text-[26px] leading-none transition-colors hover:bg-fill-hover focus-visible:bg-fill-hover"
                  initial={{ opacity: 0, y: 8, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring.snappy, delay: index * 0.03 } }}
                  whileHover={{ scale: 1.2, y: -3 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => allowed() && onReact(emoji)}
                >
                  {emoji}
                </motion.button>
              ))}
            </Glass>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
