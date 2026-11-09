import { useEffect } from "react";
import { toast } from "../../ui/toast.ts";
import { takeUntoldReunions, useCircles } from "../circles/circles.ts";

/** Once my circles are loaded, tells me who reunited two of them since I last came (« Darius a réuni vos deux cercles »). */
export function useReunionNews(me: string): void {
  const ready = useCircles((s) => s.status === "ready");
  useEffect(() => {
    if (!ready || !me) return;
    for (const circle of takeUntoldReunions(me, Date.now())) {
      const by = circle.reunitedBy;
      if (by) toast({ message: `${by.name} a réuni vos deux cercles`, name: by.name, color: by.color });
    }
  }, [ready, me]);
}
