import { AccountKey, KEY_WORD_COUNT } from "@annamour/protocol";
import { ScanFace } from "lucide-react";
import { m, useAnimationControls } from "motion/react";
import { type ClipboardEvent, type FormEvent, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { errorMessage } from "../../api/http.ts";
import { passkeysSupported } from "../../api/passkeys.ts";
import { shakeKeyframes, shakeTransition } from "../../lib/motion.ts";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { Button, Input } from "../../ui/controls.tsx";
import { BackLink } from "../../ui/ScreenTopBar.tsx";
import { safeNext } from "../account/AccountGate.tsx";
import { loginWithKey, loginWithPasskey } from "../account/account.ts";

const EMPTY = Array.from({ length: KEY_WORD_COUNT }, () => "");
const ORDINALS = ["1er mot", "2e mot", "3e mot", "4e mot"];

/** Splits a pasted key ("lune panda velours cerise", or with dots/commas) into words. */
export function splitKey(text: string): string[] {
  return text
    .trim()
    .split(/[\s·,.;-]+/u)
    .filter(Boolean);
}

/** « J'ai déjà une clé »: type (or paste) the 4 words, or use a passkey. */
export function KeyLoginScreen() {
  const [words, setWords] = useState<string[]>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controls = useAnimationControls();
  const [, navigate] = useLocation();
  const next = safeNext(new URLSearchParams(useSearch()).get("suite"));

  const fail = (message: string) => {
    setError(message);
    setBusy(false);
    void controls.start({ x: shakeKeyframes, transition: shakeTransition });
  };

  const attempt = async (login: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await login();
      navigate(next, { replace: true });
    } catch (failure) {
      fail(errorMessage(failure));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const key = AccountKey.safeParse(words);
    if (!key.success)
      return fail(words.some((w) => !w.trim()) ? "Il manque des mots." : "Chaque mot ne contient que des lettres.");
    void attempt(() => loginWithKey(key.data));
  };

  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    const parts = splitKey(event.clipboardData.getData("text"));
    if (parts.length < KEY_WORD_COUNT) return;
    event.preventDefault();
    setWords(parts.slice(0, KEY_WORD_COUNT));
  };

  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <BrandBar start={<BackLink href="/bienvenue" />} />
      <main className="grid flex-1 place-items-center py-8 text-center">
        <form onSubmit={submit} className="grid w-[min(460px,100%)] justify-items-center gap-5" noValidate>
          <h1 className="type-title">J'ai déjà une clé</h1>
          <p className="type-lede">Tape tes 4 mots dans l'ordre, ou colle-les d'un coup.</p>
          <m.div animate={controls} onPaste={paste} className="grid w-full grid-cols-2 gap-2">
            {words.map((word, index) => (
              <Input
                key={ORDINALS[index]}
                aria-label={ORDINALS[index]}
                placeholder={ORDINALS[index]}
                value={word}
                onValueChange={(value) => setWords((all) => all.map((w, i) => (i === index ? value : w)))}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                className="text-center font-rounded-tight font-extrabold"
              />
            ))}
          </m.div>
          <p role="alert" className="min-h-6 text-sm text-danger">
            {error}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {passkeysSupported() ? (
              <Button icon={<ScanFace />} disabled={busy} onClick={() => void attempt(loginWithPasskey)}>
                Face ID
              </Button>
            ) : null}
            <Button type="submit" variant="filled" disabled={busy}>
              {busy ? "Connexion…" : "Me connecter"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
