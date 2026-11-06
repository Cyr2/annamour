import type { AccountKey } from "@annamour/protocol";
import { Copy } from "lucide-react";
import { motion } from "motion/react";
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
      <h1 className="font-rounded-tight text-[clamp(32px,4.4vw,50px)] leading-[1.05] font-extrabold text-fg">
        Voici ta clé
      </h1>
      <p className="text-md text-fg-muted">
        Ces 4 mots sont ton compte. Avec eux, tu retrouves tes séances sur n'importe quel appareil. Note-les quelque
        part.
      </p>
      <ol className="grid w-full grid-cols-2 gap-2.5" aria-label="Ta clé de 4 mots">
        {keyWords.map((word, index) => (
          <motion.li
            key={word}
            className="rounded-[18px] border border-line-strong bg-fill-soft p-3.5 font-rounded-tight text-xl font-black text-fg select-all"
            initial={{ opacity: 0, y: 14, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring.bubble, delay: index * 0.25 }}
          >
            {word}
          </motion.li>
        ))}
      </ol>
      <div className="flex w-full flex-wrap gap-2">
        <Button icon={<Copy />} onClick={copy} className="flex-1">
          {copied === "done" ? "Copiée" : copied === "failed" ? "Sélectionne-la" : "Copier"}
        </Button>
        <Button variant="filled" onClick={onDone} className="flex-1">
          Je l'ai notée
        </Button>
      </div>
    </div>
  );
}
