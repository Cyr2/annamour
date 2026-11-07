import { normalizeTvPairingCode } from "@annamour/protocol";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Redirect, useSearch } from "wouter";
import { CodeLetters } from "../../ui/CodeLetters.tsx";
import { Button } from "../../ui/controls.tsx";
import { QrCode } from "../../ui/QrCode.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { Wordmark } from "../../ui/Wordmark.tsx";
import { safeNext } from "../account/AccountGate.tsx";
import { refreshAccount, useAccount } from "../account/account.ts";
import { resetSessions } from "../sessions/sessions.ts";
import type { PairingState } from "./pairing.ts";
import { useTvPairing } from "./useTvPairing.ts";

/** Where the phone lands when it scans the TV's QR code: the confirmation, code included. */
export function pairingUrl(origin: string, code: string): string {
  return `${origin}/tv#${normalizeTvPairingCode(code)}`;
}

const SIGNED_IN_BUT_OFFLINE = "La TV est reliée, mais le serveur ne répond pas. Réessaie dans un instant.";

/**
 * « Relie cette TV à ton compte » (TV only, instead of the first launch): a
 * QR code and a short code; the phone, already signed in, confirms. Nothing
 * is ever typed on the TV.
 */
export function TvPairingScreen() {
  const next = safeNext(new URLSearchParams(useSearch()).get("suite"));
  const member = useAccount((s) => s.status === "member");
  const [failure, setFailure] = useState<string | null>(null);
  const { state, retry } = useTvPairing(async () => {
    resetSessions();
    await refreshAccount();
    if (useAccount.getState().status !== "member") setFailure(SIGNED_IN_BUT_OFFLINE);
  });

  if (member) return <Redirect to={next} replace />;

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <header className="flex min-h-12 items-center">
        <Wordmark />
      </header>
      <main className="grid flex-1 content-center items-center gap-10 py-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-[6vw]">
        <Surface className="surface-panel grid size-[min(20rem,80vw)] place-items-center justify-self-center p-5">
          {state.phase === "waiting" ? (
            <QrCode
              value={pairingUrl(window.location.origin, state.code)}
              label="QR code pour relier cette TV à ton compte"
              className="size-full"
            />
          ) : (
            <ThreadSpinner />
          )}
        </Surface>
        <div className="grid justify-items-start gap-5 text-left">
          <h1 className="type-title">Relie cette TV à ton compte</h1>
          <p className="type-lede">
            Scanne ce code avec ton téléphone. Ou, sur ton téléphone, ouvre Annamour, puis Profil, « Lier une TV », et
            tape :
          </p>
          <PairingStatus state={state} failure={failure} onRetry={failure ? () => window.location.reload() : retry} />
        </div>
      </main>
    </div>
  );
}

function PairingStatus({
  state,
  failure,
  onRetry,
}: {
  state: PairingState;
  failure: string | null;
  onRetry: () => void;
}) {
  const message = failure ?? (state.phase === "error" ? state.message : null);
  if (message) {
    return (
      <div className="grid justify-items-start gap-4">
        <p role="alert" className="text-md text-danger">
          {message}
        </p>
        <div data-tv-primary>
          <Button variant="filled" size="large" icon={<RefreshCw />} onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="min-h-[clamp(4rem,8.6vw,5.5rem)]" aria-live="polite">
        {state.phase === "waiting" ? <CodeLetters key={state.code} code={state.code} /> : null}
      </div>
      <ol className="grid list-inside list-decimal gap-1.5 text-md text-fg-muted marker:font-bold marker:text-accent">
        <li>Ton téléphone te demande « Lier la TV ? »</li>
        <li>Tu confirmes : la TV affiche tes séances.</li>
      </ol>
      <p role="status" className="flex items-center gap-3 text-sm text-fg-subtle">
        <ThreadSpinner />
        {state.phase === "waiting" ? "En attente de ton téléphone…" : "Préparation du code…"}
      </p>
    </>
  );
}
