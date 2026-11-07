import { House } from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { Route, Switch } from "wouter";
import { AccountGate } from "./features/account/AccountGate.tsx";
import { HomeScreen } from "./features/home/HomeScreen.tsx";
import { TabNav } from "./features/nav/TabNav.tsx";
import { JoinScreen, KeyLoginScreen, LinkDeviceScreen, ProfileScreen, SessionScreen, WelcomeScreen } from "./routes.ts";
import { Ambient } from "./ui/Ambient.tsx";
import { LinkButton } from "./ui/LinkButton.tsx";
import { NoticeScreen } from "./ui/NoticeScreen.tsx";
import { RouteFallback } from "./ui/RouteFallback.tsx";
import { Toaster } from "./ui/Toaster.tsx";

const gated = (screen: ReactNode) => <AccountGate>{screen}</AccountGate>;

/** Home ships with the app; every other screen is fetched the first time it opens (see routes.ts). */
export function App() {
  return (
    <>
      <Ambient />
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/bienvenue" component={WelcomeScreen} />
          <Route path="/cle" component={KeyLoginScreen} />
          <Route path="/lier" component={LinkDeviceScreen} />
          <Route path="/">{() => gated(<HomeScreen />)}</Route>
          <Route path="/rejoindre">{() => gated(<JoinScreen />)}</Route>
          <Route path="/profil">{() => gated(<ProfileScreen />)}</Route>
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
      <TabNav />
      <Toaster />
    </>
  );
}
