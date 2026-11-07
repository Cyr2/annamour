import { lazy } from "react";

/*
 * The screens loaded on demand: each is its own chunk, so the first launch
 * and the home screen only download what they show. `preloadRoute` fetches
 * a screen ahead of time (on hover, on focus, when the app is idle).
 */

const loaders = {
  welcome: () => import("./features/welcome/WelcomeScreen.tsx"),
  key: () => import("./features/welcome/KeyLoginScreen.tsx"),
  link: () => import("./features/welcome/LinkDeviceScreen.tsx"),
  join: () => import("./features/join/JoinScreen.tsx"),
  profile: () => import("./features/profile/ProfileScreen.tsx"),
  watchlist: () => import("./features/watchlist/WatchlistScreen.tsx"),
  list: () => import("./features/list/OurListScreen.tsx"),
  us: () => import("./features/us/UsScreen.tsx"),
  joinCircle: () => import("./features/us/JoinCircleScreen.tsx"),
  session: () => import("./features/session/SessionScreen.tsx"),
  report: () => import("./features/report/ReportScreen.tsx"),
  tvPairing: () => import("./features/tv/TvPairingScreen.tsx"),
  tvLink: () => import("./features/tv-link/TvLinkScreen.tsx"),
};

export type RouteName = keyof typeof loaders;

export function preloadRoute(name: RouteName): void {
  void loaders[name]().catch(() => {
    // Offline or a new deploy: the route loads (or reports) when it is actually opened.
  });
}

export const WelcomeScreen = lazy(() => loaders.welcome().then((m) => ({ default: m.WelcomeScreen })));
export const KeyLoginScreen = lazy(() => loaders.key().then((m) => ({ default: m.KeyLoginScreen })));
export const LinkDeviceScreen = lazy(() => loaders.link().then((m) => ({ default: m.LinkDeviceScreen })));
export const JoinScreen = lazy(() => loaders.join().then((m) => ({ default: m.JoinScreen })));
export const ProfileScreen = lazy(() => loaders.profile().then((m) => ({ default: m.ProfileScreen })));
export const WatchlistScreen = lazy(() => loaders.watchlist().then((m) => ({ default: m.WatchlistScreen })));
export const OurListScreen = lazy(() => loaders.list().then((m) => ({ default: m.OurListScreen })));
export const UsScreen = lazy(() => loaders.us().then((m) => ({ default: m.UsScreen })));
export const JoinCircleScreen = lazy(() => loaders.joinCircle().then((m) => ({ default: m.JoinCircleScreen })));
export const SessionScreen = lazy(() => loaders.session().then((m) => ({ default: m.SessionScreen })));
export const ReportScreen = lazy(() => loaders.report().then((m) => ({ default: m.ReportScreen })));
export const TvPairingScreen = lazy(() => loaders.tvPairing().then((m) => ({ default: m.TvPairingScreen })));
export const TvLinkScreen = lazy(() => loaders.tvLink().then((m) => ({ default: m.TvLinkScreen })));
