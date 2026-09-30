// Serializable data the Overview page hands to the dashboard-4 layout.

export interface StatItem {
  label: string;
  value: string;
  note: string;
  trend?: { dir: "up" | "down"; text: string };
  tone?: "good" | "bad";
}

export interface MonthPoint {
  month: string;
  revenue: number;
  returning: number;
  fresh: number;
}

export interface ServiceRank {
  name: string;
  revenue: number;
  visits: number;
}

export interface QuickAction {
  href?: string; // link actions
  run?: boolean; // the "Run automations" server action
  title: string;
  description: string;
  icon: "scissors" | "user-plus" | "send" | "ticket" | "zap" | "megaphone";
  badge?: string;
}

export interface ChurnRow {
  id: string;
  name: string;
  lastVisit: string;
  cycle: string;
  spend: string;
  high: boolean;
}

export interface TopMember {
  id: string;
  name: string;
  points: string;
  tier: string;
  tierColor: string;
}

export interface CampaignSummary {
  revenue: string;
  cost: string;
  roi: string;
  live: { name: string; status: string; detail: string }[];
}

export interface DashboardData {
  stats: StatItem[];
  months: MonthPoint[];
  services: ServiceRank[];
  actions: QuickAction[];
  churn: ChurnRow[];
  top: TopMember[];
  campaigns: CampaignSummary;
}
