/** The app's four places, in the tab bar's order. */
export const TABS = [
  { value: "accueil", href: "/", label: "Accueil" },
  { value: "rejoindre", href: "/rejoindre", label: "Rejoindre" },
  { value: "aregarder", href: "/a-regarder", label: "À regarder" },
  { value: "profil", href: "/profil", label: "Profil" },
] as const;

export type TabValue = (typeof TABS)[number]["value"];

/**
 * The tab of the screen at `path`, or null where the bar is hidden: the
 * player and the salon, the first launch, and any other page.
 */
export function tabFor(path: string): TabValue | null {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return TABS.find((tab) => tab.href === clean)?.value ?? null;
}
