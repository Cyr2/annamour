import type { AccountKey } from "@annamour/protocol";
import { Copy, Eye, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { copyLabel, useCopy } from "../../lib/useCopy.ts";
import { Button } from "../../ui/controls.tsx";
import { KeyWords } from "../../ui/KeyWords.tsx";
import { Sheet } from "../../ui/Sheet.tsx";

interface SignOutSheetProps {
  open: boolean;
  /** The words kept on this device, if any: offered one last time before leaving. */
  keyWords: AccountKey | null;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * The last word before leaving: signing out forgets the key on this device,
 * and without the 4 words nobody can open the account again.
 */
export function SignOutSheet({ open, keyWords, onClose, onConfirm }: SignOutSheetProps) {
  const [shown, setShown] = useState(false);
  // Hidden again on each opening: the words never stay on screen by default.
  useEffect(() => {
    if (open) setShown(false);
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Te déconnecter ?">
      <Sheet.Lede>
        Sans tes 4 mots, tu ne pourras plus retrouver ton compte.{" "}
        {keyWords
          ? "Note-les avant de partir : ils seront effacés de cet appareil."
          : "Ils ne sont pas sur cet appareil : vérifie que tu les as notés."}
      </Sheet.Lede>
      {keyWords && shown ? <ShownKey keyWords={keyWords} /> : null}
      {keyWords && !shown ? (
        <Button icon={<Eye />} onClick={() => setShown(true)}>
          Afficher ma clé
        </Button>
      ) : null}
      <Sheet.Actions>
        <Button onClick={onClose}>Garder</Button>
        <Button tone="destructive" icon={<LogOut />} onClick={onConfirm}>
          Me déconnecter
        </Button>
      </Sheet.Actions>
    </Sheet>
  );
}

function ShownKey({ keyWords }: { keyWords: AccountKey }) {
  const [copied, copy] = useCopy(keyWords.join(" "));
  return (
    <div className="grid gap-3">
      <KeyWords words={keyWords} label="Ta clé de 4 mots" />
      <Button icon={<Copy />} tone="accent" onClick={() => void copy()}>
        {copyLabel(copied)}
      </Button>
    </div>
  );
}
