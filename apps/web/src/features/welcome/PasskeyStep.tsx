import { ScanFace } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { Button, Glass } from "../../ui/controls.tsx";
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
      <Glass className="surface-panel grid size-[88px] place-items-center text-accent">
        <ScanFace className="size-11" strokeWidth={1.5} aria-hidden />
      </Glass>
      <h1 className="type-title">Activer Face ID ?</h1>
      <p className="type-lede">Tu n'auras plus besoin de ta clé sur cet appareil. Elle reste ta solution de secours.</p>
      <p role="alert" className="min-h-6 text-sm text-danger">
        {error}
      </p>
      <div className="flex w-full flex-wrap justify-center gap-3 max-sm:[&>*]:flex-1">
        <Button size="large" onClick={onDone}>
          Plus tard
        </Button>
        <Button variant="filled" size="large" icon={<ScanFace />} onClick={enable} disabled={busy}>
          {busy ? "Un instant…" : "Activer Face ID"}
        </Button>
      </div>
    </div>
  );
}
