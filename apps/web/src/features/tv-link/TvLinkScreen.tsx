import { formatTvPairingCode } from "@annamour/protocol";
import { Check, House, Tv } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { approveTvPairing, checkTvPairingCode, TV_CODE_MESSAGES } from "../../api/tv.ts";
import { CodeLetters } from "../../ui/CodeLetters.tsx";
import { Button } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { NoticeScreen } from "../../ui/NoticeScreen.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { TvCodeForm } from "./TvCodeForm.tsx";
import { codeFromHash } from "./tv-link.ts";

type Step =
  | { kind: "enter" }
  | { kind: "checking"; code: string }
  | { kind: "confirm"; code: string; busy: boolean }
  | { kind: "done" }
  | { kind: "error"; message: string };

/**
 * Linking a TV, on the phone: opened by scanning the TV's QR code (the code
 * comes in the link) or from Profil → « Lier une TV ». The code is checked,
 * then « Lier la TV ? » asks for a confirmation; the TV signs in by itself.
 */
export function TvLinkScreen() {
  const [step, setStep] = useState<Step>(() => {
    const code = codeFromHash(window.location.hash);
    return code ? { kind: "checking", code } : { kind: "enter" };
  });

  const checking = step.kind === "checking" ? step.code : null;
  useEffect(() => {
    if (!checking) return;
    let cancelled = false;
    checkTvPairingCode(checking)
      .then((status) => {
        if (cancelled) return;
        if (status === "pending") setStep({ kind: "confirm", code: checking, busy: false });
        else
          setStep({ kind: "error", message: status === "expired" ? TV_CODE_MESSAGES.expired : TV_CODE_MESSAGES.used });
      })
      .catch((failure: unknown) => {
        if (!cancelled) setStep({ kind: "error", message: errorMessage(failure) });
      });
    return () => {
      cancelled = true;
    };
  }, [checking]);

  const approve = async (code: string) => {
    setStep({ kind: "confirm", code, busy: true });
    try {
      await approveTvPairing(code);
      setStep({ kind: "done" });
    } catch (failure) {
      setStep({ kind: "error", message: errorMessage(failure) });
    }
  };

  return (
    <NoticeScreen>
      {step.kind === "enter" ? (
        <>
          <h1 className="type-heading text-[1.625rem]">Lier une TV</h1>
          <p className="text-sm text-fg-muted">
            Ouvre Annamour sur la TV : elle affiche un code de 6 caractères. Tape-le ici.
          </p>
          <TvCodeForm onCode={(code) => setStep({ kind: "checking", code })} />
        </>
      ) : null}
      {step.kind === "checking" ? (
        <p className="flex items-center gap-3 text-fg-muted" role="status">
          <ThreadSpinner />
          On vérifie le code…
        </p>
      ) : null}
      {step.kind === "confirm" ? (
        <>
          <Tv aria-hidden className="size-10 text-accent" />
          <h1 className="type-heading text-[1.625rem]">Lier la TV ?</h1>
          <CodeLetters code={formatTvPairingCode(step.code)} size="compact" />
          <p className="text-sm text-fg-muted">
            Vérifie que ce code est bien celui affiché sur la TV. Elle ouvrira tes séances avec ton compte.
          </p>
          <div className="flex w-full flex-col-reverse gap-2.5 sm:flex-row sm:justify-center">
            <LinkButton href="/profil">Annuler</LinkButton>
            <Button variant="filled" icon={<Check />} disabled={step.busy} onClick={() => void approve(step.code)}>
              {step.busy ? "Liaison…" : "Lier la TV"}
            </Button>
          </div>
        </>
      ) : null}
      {step.kind === "done" ? (
        <>
          <Check aria-hidden className="size-10 text-success" />
          <div role="status" className="grid gap-2">
            <h1 className="type-heading text-[1.625rem]">La TV est liée</h1>
            <p className="text-sm text-fg-muted">Elle affiche maintenant tes séances. Tu peux poser ton téléphone.</p>
          </div>
          <LinkButton href="/" variant="filled" icon={<House />}>
            Retour à l'accueil
          </LinkButton>
        </>
      ) : null}
      {step.kind === "error" ? (
        <>
          <p role="alert" className="text-md text-fg">
            {step.message}
          </p>
          <Button variant="filled" onClick={() => setStep({ kind: "enter" })}>
            Saisir le code
          </Button>
          <LinkButton href="/profil">Retour au profil</LinkButton>
        </>
      ) : null}
    </NoticeScreen>
  );
}
