import { Route, Switch } from "wouter";
import { Foundations } from "./routes/Foundations.tsx";
import { Session } from "./routes/Session.tsx";
import { Toaster } from "./ui/Toaster.tsx";

export function App() {
  return (
    <>
      <Switch>
        <Route path="/" component={Foundations} />
        <Route path="/s/:code">{(params) => <Session code={params.code} />}</Route>
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
