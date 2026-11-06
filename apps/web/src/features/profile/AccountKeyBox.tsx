import type { AccountKey } from "@annamour/protocol";
import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/controls.tsx";
import { cx } from "../../ui/cx.ts";

const MASK = "••••••";

/** The 4 words kept on this device: hidden until asked, then copyable. */
export function AccountKeyBox({ keyWords }: { keyWords: AccountKey | null }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  if (!keyWords) {
    return (
      <p className="rounded-control border border-line bg-fill-soft p-4 text-sm text-fg-muted">
        Ta clé n'est pas enregistrée sur cet appareil : tu t'es connecté par QR code ou Face ID. Tu la retrouves sur
        l'appareil où tu as créé ton compte.
      </p>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(keyWords.join(" "));
      setCopied("done");
    } catch {
      setShown(true);
      setCopied("failed");
    }
  };

  return (
    <div className="grid gap-3">
      <ol className="grid grid-cols-2 gap-2" aria-label={shown ? "Ta clé de 4 mots" : "Ta clé de 4 mots, masquée"}>
        {keyWords.map((word) => (
          <li
            key={word}
            className={cx(
              "rounded-control border border-line-strong bg-fill-soft px-3.5 py-2.5 font-rounded-tight text-lg font-black",
              shown ? "text-fg select-all" : "text-fg-subtle select-none",
            )}
          >
            {shown ? word : <span aria-hidden>{MASK}</span>}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          icon={shown ? <EyeOff /> : <Eye />}
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
          className="flex-1"
        >
          {shown ? "Masquer" : "Afficher"}
        </Button>
        <Button icon={<Copy />} onClick={copy} className="flex-1">
          {copied === "done" ? "Copiée" : copied === "failed" ? "Sélectionne-la" : "Copier"}
        </Button>
      </div>
    </div>
  );
}
