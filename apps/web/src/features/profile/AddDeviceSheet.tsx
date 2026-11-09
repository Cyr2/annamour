import { RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "../../ui/controls.tsx";
import { QrCode } from "../../ui/QrCode.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { formatCountdown, linkUrl } from "./link-countdown.ts";
import { useLinkToken } from "./useLinkToken.ts";

/** « Ajouter un appareil »: a one-time QR code, valid 5 minutes, renewed on its own. */
export function AddDeviceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Ajouter un appareil">
      <Sheet.Lede>Sur ton autre appareil à toi, ouvre l'appareil photo et scanne ce code : c'est relié.</Sheet.Lede>
      <LinkQr />
      <Sheet.Actions>
        <Button variant="filled" onClick={onClose}>
          Terminé
        </Button>
      </Sheet.Actions>
    </Sheet>
  );
}

/** Mounted only while the sheet is open, so a token is only made when someone is looking. */
function LinkQr() {
  const { link, remaining, error, retry } = useLinkToken();

  if (error) {
    return (
      <div className="grid justify-items-center gap-3 py-6 text-center">
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <Button icon={<RefreshCw />} onClick={retry}>
          Réessayer
        </Button>
      </div>
    );
  }

  // Framed in the thread's colour and tagged, so it is never mistaken for a séance's QR code.
  return (
    <div className="grid justify-items-center gap-3 text-center">
      <div className="grid justify-items-center gap-3 rounded-panel border-2 border-accent p-4">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
          <ShieldAlert aria-hidden className="size-3.5" />
          Connexion à ton compte
        </span>
        <div className="grid size-[200px] place-items-center">
          {link ? (
            <QrCode
              value={linkUrl(window.location.origin, link.token)}
              label="QR code de connexion à ton compte"
              className="size-full"
            />
          ) : (
            <ThreadSpinner />
          )}
        </div>
      </div>
      <p className="max-w-[32ch] text-sm font-semibold text-pretty text-fg">
        Il donne accès à ton compte : ne le montre qu'à toi-même.
      </p>
      <p className="text-sm text-fg-muted" aria-live="off">
        {link ? `Valable encore ${formatCountdown(remaining)}, une seule fois.` : "Préparation du code…"}
      </p>
      <p className="text-xs text-fg-subtle">Tu peux aussi taper ta clé de 4 mots sur l'autre appareil.</p>
    </div>
  );
}
