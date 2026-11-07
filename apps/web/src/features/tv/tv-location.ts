import { type BrowserLocationHook, navigate, usePathname } from "wouter/use-browser-location";

/** Navigation that replaces the current page instead of stacking a new one. */
const replacing: typeof navigate = (to, options) => navigate(to, { ...options, replace: true });

/**
 * wouter's location on a TV: every move replaces the page in the history.
 * The remote's Retour goes back inside the app (see TvRemote), so the
 * browser history stays one page deep and the Android TV app closes from
 * the home screen instead of replaying old screens.
 */
export const useTvLocation: BrowserLocationHook = (options) => [usePathname(options), replacing];
