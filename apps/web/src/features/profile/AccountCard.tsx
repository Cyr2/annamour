import { LogOut, Smartphone, Tv } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { errorMessage } from "../../api/http.ts";
import { passkeysSupported } from "../../api/passkeys.ts";
import { Surface } from "../../ui/Surface.tsx";
import { toast } from "../../ui/toast.ts";
import { logout, registerPasskey, useAccount } from "../account/account.ts";
import { PasskeyIcon } from "../account/PasskeyIcon.tsx";
import { thisDevicePasskey } from "../account/passkey-wording.ts";
import { useTv } from "../tv/tv-context.ts";
import { AccountKeyBox } from "./AccountKeyBox.tsx";
import { AccountRow } from "./AccountRow.tsx";
import { AddDeviceSheet } from "./AddDeviceSheet.tsx";
import { LinkTvSheet } from "./LinkTvSheet.tsx";
import { NewKeyRow } from "./NewKeyRow.tsx";
import { SignOutSheet } from "./SignOutSheet.tsx";

/** « Ton compte »: the key, another device, a passkey, and leaving (which asks first). */
export function AccountCard() {
  const keyWords = useAccount((s) => s.key);
  const [addingDevice, setAddingDevice] = useState(false);
  const [linkingTv, setLinkingTv] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const tv = useTv();
  const [, navigate] = useLocation();

  const signOut = async () => {
    try {
      await logout();
      navigate("/bienvenue", { replace: true });
    } catch (failure) {
      toast({ message: errorMessage(failure) });
    }
  };

  return (
    <Surface className={tv ? "surface-panel grid gap-3 p-5" : "surface-panel grid gap-4 p-4 sm:p-6"}>
      <div className="grid gap-1">
        <h2 className="type-heading">Ton compte</h2>
        <p className="text-sm text-fg-muted">Ta clé, c'est ton compte : pas d'email, pas de mot de passe.</p>
      </div>
      <AccountKeyBox keyWords={keyWords} />
      <div className="grid gap-1">
        <NewKeyRow />
        <AccountRow
          icon={<Smartphone />}
          title="Ajouter un appareil"
          detail="Scanne un QR code, c'est relié"
          onClick={() => setAddingDevice(true)}
        />
        {/* Linked from a phone: the TV itself never types a code. */}
        {tv ? null : (
          <AccountRow
            icon={<Tv />}
            title="Lier une TV"
            detail="Tape le code affiché sur la TV"
            onClick={() => setLinkingTv(true)}
          />
        )}
        {/* A passkey belongs to a phone or a computer, not to a TV. */}
        {passkeysSupported() && !tv ? <PasskeyRow /> : null}
        {/* Leaving sits apart from the rest, so it is never tapped by mistake. */}
        <hr className="mx-2 my-1 border-line" />
        <AccountRow
          icon={<LogOut />}
          title="Se déconnecter"
          detail="Ta clé te reconnecte quand tu veux"
          tone="destructive"
          onClick={() => setLeaving(true)}
        />
      </div>
      <SignOutSheet
        open={leaving}
        keyWords={keyWords}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          void signOut();
        }}
      />
      <AddDeviceSheet open={addingDevice} onClose={() => setAddingDevice(false)} />
      {tv ? null : <LinkTvSheet open={linkingTv} onClose={() => setLinkingTv(false)} />}
    </Surface>
  );
}

function PasskeyRow() {
  const hasPasskey = useAccount((s) => s.account?.hasPasskey ?? false);
  const [busy, setBusy] = useState(false);
  const [wording] = useState(thisDevicePasskey);

  const enable = async () => {
    setBusy(true);
    try {
      await registerPasskey();
      toast({ message: wording.enabled });
    } catch (failure) {
      toast({ message: errorMessage(failure) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountRow
      icon={<PasskeyIcon kind={wording.icon} />}
      title={wording.enable}
      detail={busy ? "Suis les instructions de ton appareil…" : "Se connecter sans taper la clé"}
      onClick={hasPasskey ? undefined : () => void enable()}
      disabled={hasPasskey || busy}
      trailing={hasPasskey ? <span className="text-xs font-semibold text-success">Actif</span> : null}
    />
  );
}
