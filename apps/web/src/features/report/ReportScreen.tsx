import type { SeanceReport } from "@annamour/protocol";
import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchSeanceReport } from "../../api/rooms.ts";
import { Button } from "../../ui/controls.tsx";
import { ScreenTopBar } from "../../ui/ScreenTopBar.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { DeviceCard } from "./DeviceCard.tsx";

type Loaded = { status: "loading" } | { status: "ready"; report: SeanceReport } | { status: "error"; message: string };

/**
 * « Qualité de la séance »: how the film played on each device, measured by
 * the devices themselves, against the targets set for a weak link.
 */
export function ReportScreen({ code }: { code: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      setLoaded({ status: "ready", report: await fetchSeanceReport(code) });
    } catch (error) {
      setLoaded({ status: "error", message: error instanceof Error ? error.message : "Ça n'a pas marché." });
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[760px] flex-col gap-6 pb-28">
      <ScreenTopBar back={`/s/${code}`} title="Qualité de la séance" />
      <p className="text-sm text-pretty text-fg-muted">
        Chaque appareil mesure ses coupures et la qualité qu'il a pu afficher pendant le film. Les objectifs sont ceux
        d'une séance sans gêne, même avec peu de réseau.
      </p>
      <ReportBody loaded={loaded} />
      <div>
        <Button icon={<RotateCw />} onClick={() => void load()}>
          Actualiser
        </Button>
      </div>
    </div>
  );
}

function ReportBody({ loaded }: { loaded: Loaded }) {
  if (loaded.status === "loading") {
    return (
      <p className="flex items-center gap-3 text-sm text-fg-muted" role="status">
        <ThreadSpinner className="size-5 shrink-0" />
        Chargement des mesures…
      </p>
    );
  }
  if (loaded.status === "error") {
    return (
      <p role="alert" className="text-sm text-fg">
        {loaded.message}
      </p>
    );
  }
  if (loaded.report.devices.length === 0) {
    return (
      <Surface className="surface-panel p-5 text-sm text-pretty text-fg-muted">
        Pas encore de mesure : les appareils envoient la leur pendant le film, toutes les minutes.
      </Surface>
    );
  }
  return (
    <div className="grid gap-4">
      {loaded.report.devices.map((evening) => (
        <DeviceCard key={`${evening.name}-${evening.device}-${evening.engine}`} evening={evening} />
      ))}
    </div>
  );
}
