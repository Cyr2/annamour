import type { Account } from "@annamour/protocol";
import { KeyRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { linkTokenAccount } from "../../api/accounts.ts";
import { errorMessage } from "../../api/http.ts";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { NoticeScreen } from "../../ui/NoticeScreen.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { linkWithToken, useAccount } from "../account/account.ts";
import { ReplaceAccountScreen } from "./ReplaceAccountScreen.tsx";

/** Reads the one-time token from the QR link (/lier#token): it never reaches server logs. */
export function tokenFromHash(hash: string): string | null {
  const token = hash.replace(/^#/, "").trim();
  return token.length >= 16 ? token : null;
}

/** Linking would put another account in place of this device's own: ask first. The same account just links. */
export function replacesAccount(current: Account | null, target: Account): boolean {
  return current !== null && current.id !== target.id;
}

type LinkState =
  | { step: "linking" }
  | { step: "confirm"; current: Account; target: Account }
  | { step: "failed"; message: string };

const failed = (failure: unknown): LinkState => ({ step: "failed", message: errorMessage(failure) });

/** Landing page of the « Ajouter un appareil » QR code. */
export function LinkDeviceScreen() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<LinkState>({ step: "linking" });
  const [token] = useState(() => tokenFromHash(window.location.hash));

  const link = useCallback(
    (value: string) => {
      setState({ step: "linking" });
      linkWithToken(value)
        .then(() => navigate("/", { replace: true }))
        .catch((failure: unknown) => setState(failed(failure)));
    },
    [navigate],
  );

  useEffect(() => {
    if (!token) {
      setState({ step: "failed", message: "Ce lien de connexion est incomplet. Scanne à nouveau le QR code." });
      return;
    }
    const current = useAccount.getState().account;
    if (!current) return link(token);
    // This device has an account: whose the code opens decides whether to ask, without using the code.
    linkTokenAccount(token)
      .then((target) =>
        replacesAccount(current, target) ? setState({ step: "confirm", current, target }) : link(token),
      )
      .catch((failure: unknown) => setState(failed(failure)));
  }, [token, link]);

  if (state.step === "confirm" && token) {
    return (
      <ReplaceAccountScreen
        current={state.current}
        target={state.target}
        onReplace={() => link(token)}
        onCancel={() => navigate("/", { replace: true })}
      />
    );
  }

  return (
    <NoticeScreen>
      {state.step === "failed" ? (
        <>
          <p role="alert" className="text-md text-fg">
            {state.message}
          </p>
          <LinkButton href="/cle" variant="filled" icon={<KeyRound />}>
            Me connecter avec mes 4 mots
          </LinkButton>
        </>
      ) : (
        <p className="flex items-center gap-3 text-fg-muted" role="status">
          <ThreadSpinner />
          On relie cet appareil à ton compte…
        </p>
      )}
    </NoticeScreen>
  );
}
