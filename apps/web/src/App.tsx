import { House } from "lucide-react";
import { lazy, type ReactNode, Suspense } from "react";
import { Redirect, Route, Router, Switch, useSearch } from "wouter";
import { AccountGate } from "./features/account/AccountGate.tsx";
import { HomeScreen } from "./features/home/HomeScreen.tsx";
import { TabNav } from "./features/nav/TabNav.tsx";
import { TonightScreen } from "./features/tonight/TonightScreen.tsx";
import { useTv } from "./features/tv/tv-context.ts";
import { useTvLocation } from "./features/tv/tv-location.ts";
import {
  JoinCircleScreen,
  JoinScreen,
  KeyLoginScreen,
  LinkDeviceScreen,
  OurListScreen,
  ProfileScreen,
  SessionScreen,
  TvLinkScreen,
  TvPairingScreen,
  UsScreen,
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
  return (
    <Router hook={tv ? useTvLocation : undefined}>
      <Ambient />
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/bienvenue" component={tv ? ToTvPairing : WelcomeScreen} />
          <Route path="/cle" component={tv ? ToTvPairing : KeyLoginScreen} />
          <Route path="/lier" component={tv ? ToTvPairing : LinkDeviceScreen} />
          <Route path="/tv/lier" component={TvPairingScreen} />
          {/* A TV keeps its own home and profile, made for the remote; phones and computers get « Ce soir ». */}
          <Route path="/">{() => gated(tv ? <HomeScreen /> : <TonightScreen />)}</Route>
          <Route path="/liste">{() => gated(<OurListScreen />)}</Route>
          <Route path="/nous">{() => gated(<UsScreen />)}</Route>
          <Route path="/cercle/:token">{(params) => gated(<JoinCircleScreen token={params.token} />)}</Route>
          <Route path="/rejoindre">{() => gated(<JoinScreen />)}</Route>
          <Route path="/profil">{() => (tv ? gated(<ProfileScreen />) : <Redirect to="/nous" replace />)}</Route>
          <Route path="/a-regarder">
            <Redirect to="/liste" replace />
          </Route>
          <Route path="/tv">{() => gated(<TvLinkScreen />)}</Route>
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
