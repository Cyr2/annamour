import { Copy, Share } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/controls.tsx";
import { toast } from "../../ui/toast.ts";

/**
 * « Envoyer le lien » opens the phone's share sheet (Messages, WhatsApp…);
 * where there is none, « Copier le lien » puts it on the clipboard.
 */
export function InviteLinkButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  if (typeof navigator.share === "function") {
    const share = () =>
      void navigator.share({ title: "Annamour", text: `Rejoins « ${title} » sur Annamour`, url }).catch((error) => {
        // Closing the share sheet rejects too: only a refusal falls back to the clipboard.
        if (error instanceof DOMException && error.name === "AbortError") return;
        void navigator.clipboard.writeText(url).then(
          () => toast({ message: "Lien copié" }),
          () => {},
        );
      });
    return (
      <Button icon={<Share />} tone="accent" onClick={share}>
        Envoyer le lien
      </Button>
    );
  }
  return (
    <Button icon={<Copy />} tone="accent" onClick={copy}>
      {copied ? "Lien copié" : "Copier le lien"}
    </Button>
  );
}
