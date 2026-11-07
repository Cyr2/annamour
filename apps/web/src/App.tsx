import { House } from "lucide-react";
import { lazy, type ReactNode, Suspense } from "react";
import { Redirect, Route, Router, Switch, useSearch } from "wouter";
import { AccountGate } from "./features/account/AccountGate.tsx";
import { HomeScreen } from "./features/home/HomeScreen.tsx";
import { TabNav } from "./features/nav/TabNav.tsx";
import { TonightScreen } from "./features/tonight/TonightScreen.tsx";
import { useTv } from "./features/tv/tv-context.ts";
import { useTvLocation } from "./features/tv/tv-location.ts";
import { useCircleUi } from "./features/ui-version/ui-version.ts";
import {
  JoinCircleScreen,
  JoinScreen,
  KeyLoginScreen,
  LinkDeviceScreen,
  OurListScreen,
  ProfileScreen,
  ReportScreen,
  SessionScreen,
  TvLinkScreen,
  TvPairingScreen,
  UsScreen,
  WatchlistScreen,
  WelcomeScreen,
} from "./routes.ts";
import { Ambient } from "./ui/Ambient.tsx";
import { LinkButton } from "./ui/LinkButton.tsx";
import { NoticeScreen } from "./ui/NoticeScreen.tsx";
import { RouteFallback } from "./ui/RouteFallback.tsx";
import { Toaster } from "./ui/Toaster.tsx";

/** The remote's focus engine is only downloaded on a TV. */
const TvRemote = lazy(() => import("./features/tv/TvRemote.tsx").then((m) => ({ default: m.TvRemote })));

const gated = (screen: ReactNode) => <AccountGate>{screen}</AccountGate>;

/** A TV never types a name or a key: the first launch is linking it from a phone. */
function ToTvPairing() {
  const search = useSearch();
  return <Redirect to={`/tv/lier${search ? `?${search}` : ""}`} replace />;
}

/** Home ships with the app; every other screen is fetched the first time it opens (see routes.ts). */
export function App() {
  const tv = useTv();
  // A TV keeps its own home and profile, made for the remote, whichever interface is picked.
  const circles = useCircleUi() && !tv;
  return (
    <Router hook={tv ? useTvLocation : undefined}>
      <Ambient />
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/bienvenue" component={tv ? ToTvPairing : WelcomeScreen} />
          <Route path="/cle" component={tv ? ToTvPairing : KeyLoginScreen} />
          <Route path="/lier" component={tv ? ToTvPairing : LinkDeviceScreen} />
          <Route path="/tv/lier" component={TvPairingScreen} />
          {/* Each interface's pages; the other's addresses lead to their counterpart. */}
          <Route path="/">{() => gated(circles ? <TonightScreen /> : <HomeScreen />)}</Route>
          <Route path="/liste">
            {() => (circles ? gated(<OurListScreen />) : <Redirect to="/a-regarder" replace />)}
          </Route>
          <Route path="/nous">{() => (circles ? gated(<UsScreen />) : <Redirect to="/profil" replace />)}</Route>
          <Route path="/a-regarder">
            {() => (circles ? <Redirect to="/liste" replace /> : gated(<WatchlistScreen />))}
          </Route>
          <Route path="/profil">{() => (circles ? <Redirect to="/nous" replace /> : gated(<ProfileScreen />))}</Route>
          <Route path="/cercle/:token">{(params) => gated(<JoinCircleScreen token={params.token} />)}</Route>
          <Route path="/rejoindre">{() => gated(<JoinScreen />)}</Route>
          <Route path="/tv">{() => gated(<TvLinkScreen />)}</Route>
          <Route path="/s/:code/qualite">{(params) => gated(<ReportScreen code={params.code} />)}</Route>
          <Route path="/s/:code">{(params) => gated(<SessionScreen code={params.code} />)}</Route>
          <Route>
            <NoticeScreen>
              <p className="text-md text-fg">Cette page n'existe pas.</p>
              <LinkButton href="/" variant="filled" icon={<House />}>
                Retour à l'accueil
              </LinkButton>
            </NoticeScreen>
          </Route>
        </Switch>
      </Suspense>
      {tv ? (
        <Suspense fallback={null}>
          <TvRemote />
        </Suspense>
      ) : (
        <TabNav />
      )}
      <Toaster />
    </Router>
  );
}
