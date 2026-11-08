/** The app's three places, in the tab bar's order: tonight, our list, us. */
export const TABS = [
  { value: "cesoir", href: "/", label: "Ce soir" },
  { value: "liste", href: "/liste", label: "Notre liste" },
  { value: "nous", href: "/nous", label: "Nous" },
] as const;

export type TabValue = (typeof TABS)[number]["value"];

/**
 * The tab of the screen at `path`, or null where the bar is hidden: the
 * player and the salon, the first launch, joining by code, and any other page.
 */
export function tabFor(path: string): TabValue | null {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return TABS.find((tab) => tab.href === clean)?.value ?? null;
}
