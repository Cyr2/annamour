import { LogIn } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { errorMessage } from "../../api/http.ts";
import { fetchRoom } from "../../api/rooms.ts";
import { CodeInput } from "../../ui/CodeInput.tsx";
import { Button } from "../../ui/controls.tsx";
import { ScreenTopBar } from "../../ui/ScreenTopBar.tsx";

/** « Rejoindre la séance »: 4 letters, checked as soon as the last one lands. */
export function JoinScreen() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();

  const join = async (value: string) => {
    if (value.length < 4) return setError("Il manque des lettres.");
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

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <ScreenTopBar back="/" />
      <main className="grid flex-1 place-items-center py-8 text-center">
        <form
          className="grid w-[min(460px,100%)] justify-items-center gap-[22px]"
          onSubmit={(event) => {
            event.preventDefault();
            void join(code);
          }}
          noValidate
        >
          <h1 className="type-title">Rejoindre la séance</h1>
          <p className="type-lede">Tape le code à 4 lettres qu'on t'a envoyé.</p>
          <CodeInput
            label="Code de la séance"
            value={code}
            onValueChange={(value) => {
              setCode(value);
              setError(null);
            }}
            onComplete={(value) => void join(value)}
            error={error}
            focusOnMount
          />
          <Button type="submit" variant="filled" size="large" icon={<LogIn />} disabled={busy}>
            {busy ? "Recherche…" : "Rejoindre"}
          </Button>
        </form>
      </main>
    </div>
  );
}
