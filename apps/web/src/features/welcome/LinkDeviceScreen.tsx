import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { errorMessage } from "../../api/http.ts";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { NoticeScreen } from "../../ui/NoticeScreen.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { linkWithToken } from "../account/account.ts";

/** Reads the one-time token from the QR link (/lier#token): it never reaches server logs. */
export function tokenFromHash(hash: string): string | null {
  const token = hash.replace(/^#/, "").trim();
  return token.length >= 16 ? token : null;
}

/** Landing page of the « Ajouter un appareil » QR code. */
export function LinkDeviceScreen() {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = tokenFromHash(window.location.hash);
    if (!token) {
      setError("Ce lien de connexion est incomplet. Scanne à nouveau le QR code.");
      return;
    }
    linkWithToken(token)
      .then(() => navigate("/", { replace: true }))
      .catch((failure: unknown) => setError(errorMessage(failure)));
  }, [navigate]);

  return (
    <NoticeScreen>
      {error ? (
        <>
          <p role="alert" className="text-md text-fg">
            {error}
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
