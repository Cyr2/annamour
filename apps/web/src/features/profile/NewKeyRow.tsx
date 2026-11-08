import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { AccountRow } from "./AccountRow.tsx";
import { NewKeySheet } from "./NewKeySheet.tsx";

/** « Régénérer ma clé »: new words for the account, when the old ones are lost or were seen. */
export function NewKeyRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AccountRow
        icon={<RefreshCw />}
        title="Régénérer ma clé"
        detail="De nouveaux mots, tes appareils restent connectés"
        onClick={() => setOpen(true)}
      />
      <NewKeySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
