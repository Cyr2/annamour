import { Link2 } from "lucide-react";
import { toast } from "../../ui/toast.ts";

/** Copies a séance's link to invite someone in; says its code where the clipboard is refused. */
export async function copySeanceLink(code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/s/${code}`);
    toast({ message: "Lien copié", icon: <Link2 /> });
  } catch {
    toast({ message: `Le code de la séance : ${code}` });
  }
}
