/** The classic interface's four places, in the tab bar's order. */
export const CLASSIC_TABS = [
  { value: "accueil", href: "/", label: "Accueil" },
  { value: "rejoindre", href: "/rejoindre", label: "Rejoindre" },
  { value: "aregarder", href: "/a-regarder", label: "À regarder" },
  { value: "profil", href: "/profil", label: "Profil" },
] as const;

/** The circles interface's three places: tonight, our list, us. */
export const CIRCLE_TABS = [
  { value: "cesoir", href: "/", label: "Ce soir" },
  { value: "liste", href: "/liste", label: "Notre liste" },
  { value: "nous", href: "/nous", label: "Nous" },
] as const;

export type TabValue = (typeof CLASSIC_TABS)[number]["value"] | (typeof CIRCLE_TABS)[number]["value"];

/** The tabs of the interface this device shows. */
export const tabsFor = (circles: boolean) => (circles ? CIRCLE_TABS : CLASSIC_TABS);

/**
 * The tab of the screen at `path`, or null where the bar is hidden: the
 * player and the salon, the first launch, and any other page.
 */
export function tabFor(path: string, circles = false): TabValue | null {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return tabsFor(circles).find((tab) => tab.href === clean)?.value ?? null;
}
