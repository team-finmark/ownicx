import { CampaignReturn, ChurnList, TopMembers } from "@/components/ui/dashboard-4-utils/members";
import { QuickActions } from "@/components/ui/dashboard-4-utils/quick-actions";
import { RetentionChart } from "@/components/ui/dashboard-4-utils/retention-chart";
import { RevenueChart } from "@/components/ui/dashboard-4-utils/revenue-chart";
import { ServiceRankChart } from "@/components/ui/dashboard-4-utils/service-rank-chart";
import { DashboardStats } from "@/components/ui/dashboard-4-utils/stats";
import type { DashboardData } from "@/components/ui/dashboard-4-utils/types";

// dashboard-4 layout, filled with the loyalty program's own data.
export function Dashboard({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <DashboardStats stats={data.stats} />
      <RevenueChart months={data.months} />
      <RetentionChart months={data.months} />
      <ServiceRankChart services={data.services} />
      <QuickActions actions={data.actions} />
      <ChurnList rows={data.churn} />
      <TopMembers members={data.top} />
      <CampaignReturn c={data.campaigns} />
    </div>
  );
}

export default Dashboard;
