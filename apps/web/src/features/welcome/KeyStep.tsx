import type { AccountKey } from "@annamour/protocol";
import { Copy } from "lucide-react";
import { copyLabel, useCopy } from "../../lib/useCopy.ts";
import { Button } from "../../ui/controls.tsx";
import { KeyWords } from "../../ui/KeyWords.tsx";

/** Step 2: the 4 words appear one by one. They are the account: write them down. */
export function KeyStep({ keyWords, onDone }: { keyWords: AccountKey; onDone: () => void }) {
  const [copied, copy] = useCopy(keyWords.join(" "));

  return (
    <div className="grid w-full justify-items-center gap-5">
      <h1 className="type-title">Voici ta clé</h1>
      <p className="type-lede">
        Ces 4 mots sont ton compte. Avec eux, tu retrouves tes séances sur n'importe quel appareil. Note-les quelque
        part.
      </p>
      <KeyWords words={keyWords} />
      <div className="flex w-full flex-wrap gap-2">
        <Button icon={<Copy />} tone="accent" onClick={copy} className="flex-1">
          {copyLabel(copied)}
        </Button>
        <Button variant="filled" onClick={onDone} className="flex-1">
          Je l'ai notée
        </Button>
      </div>
    </div>
  );
}
