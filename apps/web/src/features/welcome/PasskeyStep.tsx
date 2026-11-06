import { ScanFace } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { Button } from "../../ui/controls.tsx";
import { toast } from "../../ui/toast.ts";
import { registerPasskey } from "../account/account.ts";

/** Step 3, optional: a passkey so this device never needs the key again. */
export function PasskeyStep({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await registerPasskey();
      toast({ message: "Face ID activé sur cet appareil" });
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <div className="grid w-full justify-items-center gap-5">
      <span className="grid size-[88px] place-items-center rounded-[28px] border border-line-strong bg-fill-soft text-fg">
        <ScanFace className="size-11" aria-hidden />
      </span>
      <h1 className="font-rounded-tight text-[clamp(32px,4.4vw,50px)] leading-[1.05] font-extrabold text-fg">
        Activer Face ID ?
      </h1>
      <p className="text-md text-fg-muted">
        Tu n'auras plus besoin de ta clé sur cet appareil. Elle reste ta solution de secours.
      </p>
      <p role="alert" className="min-h-6 text-sm text-danger">
        {error}
      </p>
      <Button variant="filled" size="large" icon={<ScanFace />} onClick={enable} disabled={busy}>
        {busy ? "Un instant…" : "Activer Face ID"}
      </Button>
      <button
        type="button"
        onClick={onDone}
        className="min-h-11 text-sm font-semibold text-fg-muted underline underline-offset-4"
      >
        Plus tard
      </button>
    </div>
  );
}
