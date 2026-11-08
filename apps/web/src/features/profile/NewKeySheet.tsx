import type { AccountKey } from "@annamour/protocol";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { copyLabel, useCopy } from "../../lib/useCopy.ts";
import { Button } from "../../ui/controls.tsx";
import { KeyWords } from "../../ui/KeyWords.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { drawNewKey } from "../account/account.ts";

/**
 * « Régénérer ma clé », in two steps in one sheet: first what it changes, then
 * the new words, shown like on the first launch so they get written down.
 */
export function NewKeySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, setKey] = useState<AccountKey | null>(null);
  // Reset on opening, not on closing: the sheet keeps its last step while it slides away.
  useEffect(() => {
    if (open) setKey(null);
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={key ? "Voici ta nouvelle clé" : "Régénérer ta clé ?"}>
      {key ? <NewKey keyWords={key} onDone={onClose} /> : <Confirm onCancel={onClose} onDrawn={setKey} />}
    </Sheet>
  );
}

function Confirm({ onCancel, onDrawn }: { onCancel: () => void; onDrawn: (key: AccountKey) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draw = async () => {
    setBusy(true);
    setError(null);
    try {
      onDrawn(await drawNewKey());
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet.Lede>
        Tu reçois 4 nouveaux mots. Les anciens ne marcheront plus, nulle part. Tes appareils déjà connectés le restent.
      </Sheet.Lede>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Sheet.Actions>
        <Button onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
        <Button variant="filled" onClick={() => void draw()} disabled={busy}>
          {busy ? "Un instant…" : "Régénérer"}
        </Button>
      </Sheet.Actions>
    </>
  );
}

function NewKey({ keyWords, onDone }: { keyWords: AccountKey; onDone: () => void }) {
  const [copied, copy] = useCopy(keyWords.join(" "));
  return (
    <>
      <Sheet.Lede>Note-la quelque part : c'est elle qui ouvre ton compte sur un nouvel appareil.</Sheet.Lede>
      <KeyWords words={keyWords} label="Ta nouvelle clé de 4 mots" />
      <Sheet.Actions>
        <Button icon={<Copy />} tone="accent" onClick={copy}>
          {copyLabel(copied)}
        </Button>
        <Button variant="filled" onClick={onDone}>
          Je l'ai notée
        </Button>
      </Sheet.Actions>
    </>
  );
}
