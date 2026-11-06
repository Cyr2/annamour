import { LogOut, ScanFace, Smartphone } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { errorMessage } from "../../api/http.ts";
import { passkeysSupported } from "../../api/passkeys.ts";
import { Glass } from "../../ui/controls.tsx";
import { toast } from "../../ui/toast.ts";
import { logout, registerPasskey, useAccount } from "../account/account.ts";
import { resetSessions } from "../sessions/sessions.ts";
import { AccountKeyBox } from "./AccountKeyBox.tsx";
import { AccountRow } from "./AccountRow.tsx";
import { AddDeviceSheet } from "./AddDeviceSheet.tsx";

/** « Ton compte »: the key, another device, Face ID, and leaving. */
export function AccountCard() {
  const keyWords = useAccount((s) => s.key);
  const [addingDevice, setAddingDevice] = useState(false);
  const [, navigate] = useLocation();

  const signOut = async () => {
    try {
      await logout();
      resetSessions();
      navigate("/bienvenue", { replace: true });
    } catch (failure) {
      toast({ message: errorMessage(failure) });
    }
  };

  return (
    <Glass className="grid gap-4 rounded-panel p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="font-rounded-tight text-lg font-extrabold text-fg">Ton compte</h2>
        <p className="text-sm text-fg-muted">Ta clé, c'est ton compte : pas d'email, pas de mot de passe.</p>
      </div>
      <AccountKeyBox keyWords={keyWords} />
      <div className="grid gap-1">
        <AccountRow
          icon={<Smartphone />}
          title="Ajouter un appareil"
          detail="Scanne un QR code, c'est relié"
          onClick={() => setAddingDevice(true)}
        />
        {passkeysSupported() ? <PasskeyRow /> : null}
        <AccountRow
          icon={<LogOut />}
          title="Se déconnecter"
          detail="Ta clé te reconnecte quand tu veux"
          tone="destructive"
          onClick={() => void signOut()}
        />
      </div>
      <AddDeviceSheet open={addingDevice} onClose={() => setAddingDevice(false)} />
    </Glass>
  );
}

function PasskeyRow() {
  const hasPasskey = useAccount((s) => s.account?.hasPasskey ?? false);
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    try {
      await registerPasskey();
      toast({ message: "Face ID activé" });
    } catch (failure) {
      toast({ message: errorMessage(failure) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountRow
      icon={<ScanFace />}
      title="Activer Face ID"
      detail={busy ? "Suis les instructions de ton appareil…" : "Se connecter sans taper la clé"}
      onClick={hasPasskey ? undefined : () => void enable()}
      disabled={hasPasskey || busy}
      trailing={hasPasskey ? <span className="text-xs font-semibold text-success">Actif</span> : null}
    />
  );
}
