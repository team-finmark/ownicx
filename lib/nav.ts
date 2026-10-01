// Navigation map shared by the sidebar, the top quick-action bar and the previous/next buttons.

export const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.87M15.5 3.13a3.5 3.5 0 0 1 0 6.75",
  onboard: "M12 4v16M4 12h16",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  gift: "M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z",
  layers: "m12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5",
  share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3",
  flask: "M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3",
  receipt: "M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zM9 7h6M9 11h6M9 15h4",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  back: "M15 18l-6-6 6-6",
  next: "M9 18l6-6-6-6",
  plus: "M12 5v14M5 12h14",
  scissors: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
} as const;

export type IconName = keyof typeof ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Program",
    items: [
      { href: "/", label: "Overview", icon: "home" },
      { href: "/customers", label: "Members", icon: "users" },
      { href: "/onboarding", label: "Onboarding & KYC", icon: "onboard" },
      { href: "/campaigns", label: "Engagements", icon: "target" },
    ],
  },
  {
    label: "WhatsApp AI",
    items: [
      { href: "/automations", label: "Automations", icon: "bolt" },
      { href: "/outbox", label: "Outbox", icon: "send" },
    ],
  },
  {
    label: "Rewards",
    items: [
      { href: "/rewards", label: "Rewards & coupons", icon: "gift" },
      { href: "/tiers", label: "Tiers & ranks", icon: "layers" },
      { href: "/referrals", label: "Referrals", icon: "share" },
      { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
    ],
  },
  {
    label: "Growth & control",
    items: [
      { href: "/program", label: "Program design", icon: "map" },
      { href: "/settings", label: "Settings", icon: "sliders" },
    ],
  },
];

export const FLAT_NAV: NavItem[] = NAV.flatMap((g) => g.items);

/** Pages kept out of the sidebar (reached from Settings) — still named in the top bar. */
export const PAGE_TITLES: Record<string, string> = {
  "/account": "My account",
};

/** The everyday front-desk jobs, one tap away on every page. */
export const QUICK_ACTIONS: NavItem[] = [
  { href: "/customers#record", label: "Record visit", icon: "scissors" },
  { href: "/onboarding#add", label: "Add member", icon: "plus" },
  { href: "/outbox", label: "Outbox", icon: "send" },
  { href: "/rewards#redeem", label: "Redeem code", icon: "gift" },
];

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href.split("#")[0]));
