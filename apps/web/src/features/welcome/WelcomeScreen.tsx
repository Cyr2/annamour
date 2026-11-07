import type { AccountKey } from "@annamour/protocol";
import { ChevronLeft, KeyRound } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { passkeysSupported } from "../../api/passkeys.ts";
import { exit, spring } from "../../lib/motion.ts";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { StepDots } from "../../ui/StepDots.tsx";
import { safeNext } from "../account/AccountGate.tsx";
import { KeyStep } from "./KeyStep.tsx";
import { NameStep } from "./NameStep.tsx";
import { PasskeyStep } from "./PasskeyStep.tsx";

/*
 * First launch: a name and a colour, then the 4-word key that *is* the
 * account, then an optional passkey. Nobody signs up; the account just exists.
 * The back arrow returns to the previous step; the account, once created, stays
 * (back on the first step, the name and colour are just changed).
 */

type StepKind = "name" | "key" | "passkey";
const STEPS: readonly StepKind[] = ["name", "key", "passkey"];

/** Forward slides in from the right, back from the left. */
const slide = {
  enter: (direction: number) => ({ opacity: 0, x: 28 * direction }),
  center: { opacity: 1, x: 0, transition: spring.ui },
  leave: (direction: number) => ({ opacity: 0, x: -20 * direction, transition: exit.quick }),
};

export function WelcomeScreen() {
  const [step, setStep] = useState<StepKind>("name");
  const [direction, setDirection] = useState(1);
  // Created on the first step, kept while going back and forth.
  const [key, setKey] = useState<AccountKey | null>(null);
  const [, navigate] = useLocation();
  const next = safeNext(new URLSearchParams(useSearch()).get("suite"));
  const finish = () => navigate(next, { replace: true });
  const index = STEPS.indexOf(step);

  const go = (target: StepKind) => {
    setDirection(STEPS.indexOf(target) >= index ? 1 : -1);
    setStep(target);
  };
  const previous = STEPS[index - 1];

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <BrandBar
        start={
          previous ? (
            <IconButton
              variant="glass"
              label="Revenir à l'étape précédente"
              icon={<ChevronLeft />}
              onClick={() => go(previous)}
            />
          ) : null
        }
        end={
          step === "name" && key === null ? (
            <LinkButton href={`/cle${next === "/" ? "" : `?suite=${encodeURIComponent(next)}`}`} icon={<KeyRound />}>
              J'ai déjà une clé
            </LinkButton>
          ) : null
        }
      />
      <main className="grid flex-1 place-items-center py-8 text-center">
        {/* Positioned, so the leaving step pops out in place while the next one slides in. */}
        <div className="relative grid w-[min(440px,100%)] justify-items-center gap-6">
          <StepDots count={3} current={index} />
          {/* The old step leaves faster than the new one arrives. */}
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <m.div
              key={step}
              className="w-full"
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="leave"
            >
              {step === "name" ? (
                <NameStep
                  existingKey={key}
                  onDone={(created) => {
                    setKey(created);
                    go("key");
                  }}
                />
              ) : null}
              {step === "key" && key ? (
                <KeyStep keyWords={key} onDone={() => (passkeysSupported() ? go("passkey") : finish())} />
              ) : null}
              {step === "passkey" ? <PasskeyStep onDone={finish} /> : null}
            </m.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
