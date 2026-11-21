import { NOTE_MAX_LENGTH } from "@annamour/protocol";
import { MessageCircleHeart, Send } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { exit, spring } from "../../lib/motion.ts";
import { Button, Input } from "../../ui/controls.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Surface } from "../../ui/Surface.tsx";

interface NoteComposerProps {
  onSend: (text: string) => void;
}

/** « Un petit mot » during a pause: a short field above the capsule; Entrée sends it to everyone. */
export function NoteComposer({ onSend }: NoteComposerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
    setOpen(false);
  };

  return (
    // Not positioned itself: the field is placed against the controls capsule, just above it.
    <div ref={root}>
      <IconButton
        ref={trigger}
        label="Écrire un petit mot"
        icon={<MessageCircleHeart />}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={open ? "bg-fill-hover text-accent" : undefined}
      />
      <AnimatePresence>
        {open ? (
          <m.div
            className="absolute inset-x-1 bottom-[calc(100%+12px)] origin-bottom sm:right-3 sm:left-auto sm:w-[26rem]"
            initial={{ opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring.ui }}
            exit={{ opacity: 0, y: 6, scale: 0.96, transition: exit.quick }}
          >
            <Surface className="rounded-panel p-1.5 shadow-float">
              <form className="flex items-center gap-1.5" onSubmit={submit}>
                <Input
                  ref={field}
                  aria-label="Ton petit mot"
                  placeholder="Un petit mot pour tout le monde…"
                  value={text}
                  onValueChange={setText}
                  maxLength={NOTE_MAX_LENGTH}
                  enterKeyHint="send"
                  autoComplete="off"
                  className="min-w-0 flex-1"
                />
                <Button type="submit" variant="filled" icon={<Send />} disabled={!text.trim()}>
                  Envoyer
                </Button>
              </form>
            </Surface>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
