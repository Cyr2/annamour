import { useLocation } from "wouter";
import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { TvCodeForm } from "../tv-link/TvCodeForm.tsx";

/** « Lier une TV »: the code the TV shows, then the confirmation screen (the same one the TV's QR code opens). */
export function LinkTvSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  return (
    <Sheet open={open} onClose={onClose} title="Lier une TV">
      <Sheet.Lede>
        Ouvre Annamour sur la TV : elle affiche un QR code à scanner, ou un code de 6 caractères à taper ici.
      </Sheet.Lede>
      <TvCodeForm onCode={(code) => navigate(`/tv#${code}`)}>
        <Button onClick={onClose}>Annuler</Button>
      </TvCodeForm>
    </Sheet>
  );
}
