import type { AccountKey } from "@annamour/protocol";
import { Copy } from "lucide-react";
import { m } from "motion/react";
import { useState } from "react";
import { spring } from "../../lib/motion.ts";
import { Button } from "../../ui/controls.tsx";

/** Step 2: the 4 words appear one by one. They are the account: write them down. */
export function KeyStep({ keyWords, onDone }: { keyWords: AccountKey; onDone: () => void }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(keyWords.join(" "));
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <div className="grid w-full justify-items-center gap-5">
      <h1 className="type-title">Voici ta clé</h1>
      <p className="type-lede">
        Ces 4 mots sont ton compte. Avec eux, tu retrouves tes séances sur n'importe quel appareil. Note-les quelque
        part.
      </p>
      <ol className="grid w-full grid-cols-2 gap-2.5" aria-label="Ta clé de 4 mots">
        {keyWords.map((word, index) => (
          <m.li
            key={word}
            className="surface-tile flex min-w-0 items-baseline gap-2.5 px-4 py-3.5 text-left"
            initial={{ opacity: 0, y: 14, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring.bubble, delay: 0.1 + index * 0.18 }}
          >
            {/* The order matters to log back in: the number says it without a word. */}
            <span aria-hidden className="text-xs font-bold text-accent tabular-nums">
              {index + 1}
            </span>
            <span className="truncate font-rounded-tight text-lg font-black text-fg select-all sm:text-xl">{word}</span>
          </m.li>
        ))}
      </ol>
      <div className="flex w-full flex-wrap gap-2">
        <Button icon={<Copy />} tone="accent" onClick={copy} className="flex-1">
          {copied === "done" ? "Copiée" : copied === "failed" ? "Sélectionne-la" : "Copier"}
        </Button>
        <Button variant="filled" onClick={onDone} className="flex-1">
          Je l'ai notée
        </Button>
      </div>
    </div>
  );
}
