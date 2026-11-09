import { ChevronLeft, ChevronRight, KeyRound, UserRound } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { type ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { exit, spring } from "../../lib/motion.ts";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { GuestNameStep } from "./GuestNameStep.tsx";

/** The key login, then back to the séance this link opened. */
export function keyLoginPath(next: string): string {
  return `/cle?suite=${encodeURIComponent(next)}`;
}

/**
 * A séance link opened on a device without an account: its account if the
 * person has one (never a second « Darius »), or just a prénom to watch now.
 */
export function GuestWelcome() {
  const [step, setStep] = useState<"choose" | "name">("choose");
  const [location, navigate] = useLocation();

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <BrandBar
        start={
          step === "name" ? (
            <IconButton
              variant="glass"
              label="Revenir au choix"
              icon={<ChevronLeft />}
              onClick={() => setStep("choose")}
            />
          ) : null
        }
      />
      <main className="grid flex-1 place-items-center py-8 text-center">
        <div className="relative grid w-[min(440px,100%)] justify-items-center">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={step}
              className="w-full"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: spring.ui }}
              exit={{ opacity: 0, transition: exit.quick }}
            >
              {step === "choose" ? (
                <Choices
                  onAccount={() => navigate(keyLoginPath(location + window.location.hash))}
                  onGuest={() => setStep("name")}
                />
              ) : (
                <GuestNameStep />
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function Choices({ onAccount, onGuest }: { onAccount: () => void; onGuest: () => void }) {
  return (
    <div className="grid w-full justify-items-center gap-5">
      <h1 className="type-title">Une soirée ensemble</h1>
      <p className="type-lede">On t'attend dans la séance. Comment veux-tu entrer ?</p>
      <div className="grid w-full gap-3">
        <Choice
          icon={<KeyRound />}
          title="J'ai déjà un compte"
          detail="Tes 4 mots, ou le QR code de ton téléphone : tu retrouves tes séances."
          onClick={onAccount}
        />
        <Choice
          icon={<UserRound />}
          title="Entrer avec un prénom"
          detail="Sans compte, juste pour regarder. Tu pourras garder la séance plus tard."
          onClick={onGuest}
        />
      </div>
    </div>
  );
}

interface ChoiceProps {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}

/** One way in: a large glass row, its icon, what it does and what it means. */
function Choice({ icon, title, detail, onClick }: ChoiceProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="am-frost surface-panel flex min-h-20 w-full cursor-pointer items-center gap-4 p-4 text-left transition-transform duration-200 active:scale-[0.98]"
    >
      <span
        aria-hidden
        className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-accent [&>svg]:size-6"
      >
        {icon}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="font-rounded-tight text-md font-extrabold text-fg">{title}</b>
        <small className="text-sm text-pretty text-fg-muted">{detail}</small>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-fg-subtle" />
    </button>
  );
}
