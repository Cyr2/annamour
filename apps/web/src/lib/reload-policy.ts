/** A new version of the app may load now: anywhere but in a séance (salon or film), where a reload would cut the film. */
export function canReloadNow(path: string): boolean {
  return !path.startsWith("/s/");
}

/**
 * A calm moment to offer « Nouvelle version prête »: not in a séance, no sheet
 * open, no request on its way — never in the middle of something.
 */
export function isCalm({ path, sheetOpen, requests }: { path: string; sheetOpen: boolean; requests: number }): boolean {
  return canReloadNow(path) && !sheetOpen && requests === 0;
}
