/**
 * While a screen's code arrives: the salle obscure alone, then, if it takes
 * more than a moment, a small loop of thread (CSS only, so it costs nothing
 * to ship with the app).
 */
export function RouteFallback() {
  return (
    <main aria-busy="true" aria-label="Chargement" className="grid min-h-dvh place-items-center">
      <span aria-hidden className="am-route-spinner" />
    </main>
  );
}
