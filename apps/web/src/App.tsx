import type { ReactNode } from "react";
import { Route, Switch } from "wouter";
import { AccountGate } from "./features/account/AccountGate.tsx";
import { HomeScreen } from "./features/home/HomeScreen.tsx";
import { JoinScreen } from "./features/join/JoinScreen.tsx";
import { ProfileScreen } from "./features/profile/ProfileScreen.tsx";
import { SessionScreen } from "./features/session/SessionScreen.tsx";
import { KeyLoginScreen } from "./features/welcome/KeyLoginScreen.tsx";
import { LinkDeviceScreen } from "./features/welcome/LinkDeviceScreen.tsx";
import { WelcomeScreen } from "./features/welcome/WelcomeScreen.tsx";
import { Toaster } from "./ui/Toaster.tsx";

const gated = (screen: ReactNode) => <AccountGate>{screen}</AccountGate>;

export function App() {
  return (
    <>
      <Switch>
        <Route path="/bienvenue" component={WelcomeScreen} />
        <Route path="/cle" component={KeyLoginScreen} />
        <Route path="/lier" component={LinkDeviceScreen} />
        <Route path="/">{() => gated(<HomeScreen />)}</Route>
        <Route path="/rejoindre">{() => gated(<JoinScreen />)}</Route>
        <Route path="/profil">{() => gated(<ProfileScreen />)}</Route>
        <Route path="/s/:code">{(params) => gated(<SessionScreen code={params.code} />)}</Route>
        <Route>
          <main className="safe-area grid min-h-dvh place-items-center text-center">
            <p className="text-fg-muted">Cette page n'existe pas.</p>
          </main>
        </Route>
      </Switch>
      <Toaster />
    </>
  );
}
