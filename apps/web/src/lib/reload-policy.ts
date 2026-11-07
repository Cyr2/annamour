/** A new version of the app may load now: anywhere but in a séance (salon or film), where a reload would cut the film. */
export function canReloadNow(path: string): boolean {
  return !path.startsWith("/s/");
}
