import { type CircleInvitePreview, circleTitle } from "@annamour/protocol";
import { Check, House } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { joinCircle, previewInvite } from "../../api/circles.ts";
import { errorMessage } from "../../api/http.ts";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { Button } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { useAccount } from "../account/account.ts";
import { loadCircles, selectCircle } from "../circles/circles.ts";

/** An invitation link: who is in the circle, then « Rejoindre le cercle ». */
export function JoinCircleScreen({ token }: { token: string }) {
  const me = useAccount((s) => s.account?.id ?? "");
  const [preview, setPreview] = useState<CircleInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    previewInvite(token).then(setPreview, (failure: unknown) => setError(errorMessage(failure)));
  }, [token]);

  const join = async () => {
    setBusy(true);
    try {
      const id = await joinCircle(token);
      await loadCircles();
      selectCircle(id);
      navigate("/", { replace: true });
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  const already = preview?.members.some((person) => person.accountId === me) ?? false;

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <BrandBar />
      <main className="grid flex-1 place-items-center py-8 text-center">
        <div className="grid w-[min(28rem,100%)] justify-items-center gap-5">
          {!preview && !error ? <ThreadSpinner /> : null}
          {preview ? (
            <>
              <BubbleStack
                people={preview.members.map((p) => ({ id: p.accountId, name: p.name, color: p.color }))}
                className="scale-150"
              />
              <h1 className="type-title">Rejoindre « {circleTitle(preview, me)} » ?</h1>
              <p className="type-lede">Tu verras sa liste, et vos prochaines séances s'y rangeront toutes seules.</p>
              {already ? (
                <LinkButton href="/" variant="filled" size="large" icon={<House />}>
                  Tu en fais déjà partie
                </LinkButton>
              ) : (
                <Button variant="filled" size="large" icon={<Check />} onClick={() => void join()} disabled={busy}>
                  {busy ? "Un instant…" : "Rejoindre le cercle"}
                </Button>
              )}
            </>
          ) : null}
          {error ? (
            <>
              <p role="alert" className="text-md text-fg">
                {error}
              </p>
              <LinkButton href="/" icon={<House />}>
                Retour à l'accueil
              </LinkButton>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
