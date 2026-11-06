import type { AccountKey } from "@annamour/protocol";
import { KeyRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { passkeysSupported } from "../../api/passkeys.ts";
import { exit, spring } from "../../lib/motion.ts";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { StepDots } from "../../ui/StepDots.tsx";
import { Wordmark } from "../../ui/Wordmark.tsx";
import { safeNext } from "../account/AccountGate.tsx";
import { KeyStep } from "./KeyStep.tsx";
import { NameStep } from "./NameStep.tsx";
import { PasskeyStep } from "./PasskeyStep.tsx";

/*
 * First launch: a name and a colour, then the 4-word key that *is* the
 * account, then an optional passkey. Nobody signs up; the account just exists.
 */

type Step = { kind: "name" } | { kind: "key"; key: AccountKey } | { kind: "passkey" };

export function WelcomeScreen() {
  const [step, setStep] = useState<Step>({ kind: "name" });
  const [, navigate] = useLocation();
  const next = safeNext(new URLSearchParams(useSearch()).get("suite"));
  const finish = () => navigate(next, { replace: true });
  const index = step.kind === "name" ? 0 : step.kind === "key" ? 1 : 2;

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <header className="flex min-h-12 items-center justify-between gap-3">
        <Wordmark />
        {step.kind === "name" ? (
          <LinkButton href={`/cle${next === "/" ? "" : `?suite=${encodeURIComponent(next)}`}`} icon={<KeyRound />}>
            J'ai déjà une clé
          </LinkButton>
        ) : null}
      </header>
      <main className="grid flex-1 place-items-center py-8 text-center">
        {/* Positioned, so the leaving step pops out in place while the next one slides in. */}
        <div className="relative grid w-[min(440px,100%)] justify-items-center gap-6">
          <StepDots count={3} current={index} />
          {/* Each step slides in from the right, the way forward; the old one leaves faster than the new one arrives. */}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={step.kind}
              className="w-full"
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0, transition: spring.ui }}
              exit={{ opacity: 0, x: -20, transition: exit.quick }}
            >
              {step.kind === "name" ? <NameStep onCreated={(key) => setStep({ kind: "key", key })} /> : null}
              {step.kind === "key" ? (
                <KeyStep
                  keyWords={step.key}
                  onDone={() => (passkeysSupported() ? setStep({ kind: "passkey" }) : finish())}
                />
              ) : null}
              {step.kind === "passkey" ? <PasskeyStep onDone={finish} /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
