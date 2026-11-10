import { useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { Button, Glass } from "../../ui/controls.tsx";
import { toast } from "../../ui/toast.ts";
import { registerPasskey } from "../account/account.ts";
import { PasskeyIcon } from "../account/PasskeyIcon.tsx";
import { thisDevicePasskey } from "../account/passkey-wording.ts";

/** Step 3, optional: a passkey so this device never needs the key again. */
export function PasskeyStep({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wording] = useState(thisDevicePasskey);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await registerPasskey();
      toast({ message: `${wording.enabled} sur cet appareil` });
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <div className="grid w-full justify-items-center gap-5">
      <Glass className="surface-panel grid size-[88px] place-items-center text-accent">
        <PasskeyIcon kind={wording.icon} className="size-11" strokeWidth={1.5} />
      </Glass>
      <h1 className="type-title">{wording.enable} ?</h1>
      <p className="type-lede">{wording.lede}</p>
      <p role="alert" className="min-h-6 text-sm text-danger">
        {error}
      </p>
      <div className="flex w-full flex-wrap justify-center gap-3 max-sm:[&>*]:flex-1">
        <Button size="large" onClick={onDone}>
          Plus tard
        </Button>
        <Button
          variant="filled"
          size="large"
          icon={<PasskeyIcon kind={wording.icon} />}
          onClick={enable}
          disabled={busy}
        >
          {busy ? "Un instant…" : wording.enable}
        </Button>
      </div>
    </div>
  );
}
