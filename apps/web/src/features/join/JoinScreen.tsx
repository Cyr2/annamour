import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@annamour/protocol";
import { LogIn } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import { errorMessage } from "../../api/http.ts";
import { fetchRoom } from "../../api/rooms.ts";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { CodeInput } from "../../ui/CodeInput.tsx";
import { Button } from "../../ui/controls.tsx";
import { cx } from "../../ui/cx.ts";
import { useTv } from "../tv/tv-context.ts";

/** Only a TV downloads its on-screen keyboard. */
const LetterKeyboard = lazy(() => import("./LetterKeyboard.tsx").then((m) => ({ default: m.LetterKeyboard })));

/**
 * The code after one more letter from the on-screen keyboard. After a full
 * code (a wrong one, still shown), the next letter starts a new code.
 */
export function withLetter(code: string, letter: string): string {
  return normalizeRoomCode((code.length >= ROOM_CODE_LENGTH ? "" : code) + letter);
}

/** « Rejoindre la séance »: 4 letters, checked as soon as the last one lands. */
export function JoinScreen() {
  const tv = useTv();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();

  const join = async (value: string) => {
    if (value.length < ROOM_CODE_LENGTH) return setError("Il manque des lettres.");
    setBusy(true);
    setError(null);
    try {
      const room = await fetchRoom(value);
      navigate(`/s/${room.code}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  const type = (letter: string) => {
    if (busy) return;
    const next = withLetter(code, letter);
    setCode(next);
    setError(null);
    if (next.length === ROOM_CODE_LENGTH) void join(next);
  };

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <BrandBar />
      <main className="grid flex-1 place-items-center py-8 text-center">
        <form
          className={cx("grid justify-items-center gap-[22px]", tv ? "w-[min(40rem,100%)]" : "w-[min(28.75rem,100%)]")}
          onSubmit={(event) => {
            event.preventDefault();
            void join(code);
          }}
          noValidate
        >
          <h1 className="type-title">Rejoindre la séance</h1>
          <p className="type-lede">
            {tv
              ? "Choisis les 4 lettres du code avec les flèches, OK pour chacune."
              : "Tape le code à 4 lettres qu'on t'a envoyé."}
          </p>
          <CodeInput
            label="Code de la séance"
            value={code}
            onValueChange={(value) => {
              setCode(value);
              setError(null);
            }}
            onComplete={(value) => void join(value)}
            error={error}
            focusOnMount={!tv}
            readOnly={tv}
          />
          {tv ? (
            <Suspense fallback={null}>
              <LetterKeyboard
                onLetter={type}
                onErase={() => {
                  if (busy) return;
                  setCode(code.slice(0, -1));
                  setError(null);
                }}
              />
              <p role="status" className="min-h-6 text-sm text-fg-muted">
                {busy ? "Recherche de la séance…" : ""}
              </p>
            </Suspense>
          ) : (
            <Button type="submit" variant="filled" size="large" icon={<LogIn />} disabled={busy}>
              {busy ? "Recherche…" : "Rejoindre"}
            </Button>
          )}
        </form>
      </main>
    </div>
  );
}
