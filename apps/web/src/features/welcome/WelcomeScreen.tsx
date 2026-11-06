import type { AccountKey } from "@annamour/protocol";
import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { passkeysSupported } from "../../api/passkeys.ts";
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
          <Link
            href={`/cle${next === "/" ? "" : `?suite=${encodeURIComponent(next)}`}`}
            className="min-h-11 content-center text-sm font-semibold text-fg-muted underline underline-offset-4"
          >
            J'ai déjà une clé
          </Link>
        ) : null}
      </header>
      <main className="grid flex-1 place-items-center py-8 text-center">
        <div className="grid w-[min(460px,100%)] justify-items-center gap-5">
          <StepDots count={3} current={index} />
          {step.kind === "name" ? <NameStep onCreated={(key) => setStep({ kind: "key", key })} /> : null}
          {step.kind === "key" ? (
            <KeyStep
              keyWords={step.key}
              onDone={() => (passkeysSupported() ? setStep({ kind: "passkey" }) : finish())}
            />
          ) : null}
          {step.kind === "passkey" ? <PasskeyStep onDone={finish} /> : null}
        </div>
      </main>
    </div>
  );
}
