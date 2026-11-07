import { CircleUserRound, House, LogIn, MoonStar, Popcorn, Users } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { preloadRoute } from "../../routes.ts";
import { TabBar, type TabBarItem } from "../../ui/controls.tsx";
import { useAccount } from "../account/account.ts";
import { useCircleUi } from "../ui-version/ui-version.ts";
import { CIRCLE_TABS, CLASSIC_TABS, type TabValue, tabFor } from "./tabs.ts";

const ICONS: Record<TabValue, TabBarItem["icon"]> = {
  accueil: <House aria-hidden />,
  rejoindre: <LogIn aria-hidden />,
  aregarder: <Popcorn aria-hidden />,
  profil: <CircleUserRound aria-hidden />,
  cesoir: <MoonStar aria-hidden />,
  liste: <Popcorn aria-hidden />,
  nous: <Users aria-hidden />,
};

const withIcons = (tabs: typeof CLASSIC_TABS | typeof CIRCLE_TABS): TabBarItem[] =>
  tabs.map((tab) => ({ ...tab, icon: ICONS[tab.value] }));
const CLASSIC_ITEMS = withIcons(CLASSIC_TABS);
const CIRCLE_ITEMS = withIcons(CIRCLE_TABS);

/** Once the first screen has settled, fetch the other tabs and the séance quietly, so they open at once. */
function usePreloadNextScreens(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const preload = () => {
      preloadRoute("join");
      preloadRoute("watchlist");
      preloadRoute("list");
      preloadRoute("us");
      preloadRoute("profile");
      preloadRoute("session");
    };
    const timer = setTimeout(() => {
      if ("requestIdleCallback" in window) requestIdleCallback(preload, { timeout: 2000 });
      else preload();
    }, 2500);
    return () => clearTimeout(timer);
  }, [enabled]);
}

/**
 * The glass tab bar floating at the bottom: Accueil, Rejoindre, À regarder,
 * Profil; or, in the circles interface, Ce soir, Notre liste, Nous. Only on
 * those screens, once the account is known: never over the film,
 * the salon or the first launch. Screens leave room for it (see `safe-area`).
 */
export function TabNav() {
  const [location] = useLocation();
  const member = useAccount((s) => s.status === "member");
  const circles = useCircleUi();
  const current = tabFor(location, circles);
  usePreloadNextScreens(member);
  if (!member || !current) return null;

  return (
    <div className="am-tab-nav">
      <TabBar aria-label="Navigation" items={circles ? CIRCLE_ITEMS : CLASSIC_ITEMS} value={current} link={Link} />
    </div>
  );
}
