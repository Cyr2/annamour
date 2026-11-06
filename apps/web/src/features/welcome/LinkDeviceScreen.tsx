import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { errorMessage } from "../../api/http.ts";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { Wordmark } from "../../ui/Wordmark.tsx";
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
    <main className="safe-area grid min-h-dvh place-items-center text-center">
      <div className="grid justify-items-center gap-5">
        <Wordmark />
        {error ? (
          <>
            <p role="alert" className="max-w-[40ch] text-md text-fg">
              {error}
            </p>
            <Link
              href="/cle"
              className="min-h-11 content-center font-semibold text-accent underline underline-offset-4"
            >
              Me connecter avec mes 4 mots
            </Link>
          </>
        ) : (
          <p className="flex items-center gap-3 text-fg-muted" role="status">
            <ThreadSpinner />
            On relie cet appareil à ton compte…
          </p>
        )}
      </div>
    </main>
  );
}
