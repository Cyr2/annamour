import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { toast } from "../../ui/toast.ts";
import { drawNewKey } from "../account/account.ts";
import { AccountRow } from "./AccountRow.tsx";

/** How long « Vraiment régénérer ? » waits for the second press before standing down. */
const CONFIRM_MS = 4000;

/**
 * « Régénérer ma clé »: new words for the account, when the old ones are lost or
 * were seen by someone. They stop working at once, so the first press only asks;
 * devices already signed in stay signed in.
 */
export function NewKeyRow() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [asking]);

  const draw = async () => {
    setAsking(false);
    setBusy(true);
    try {
      await drawNewKey();
      toast({ message: "Nouvelle clé créée. Note-la : l'ancienne ne marche plus." });
    } catch (failure) {
      toast({ message: errorMessage(failure) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountRow
      icon={<RefreshCw />}
      title={asking ? "Vraiment régénérer ?" : "Régénérer ma clé"}
      detail={
        busy
          ? "Création de la nouvelle clé…"
          : asking
            ? "Touche encore : l'ancienne clé ne marchera plus"
            : "De nouveaux mots, tes appareils restent connectés"
      }
      disabled={busy}
      onClick={() => (asking ? void draw() : setAsking(true))}
    />
  );
}
