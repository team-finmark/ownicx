import { Sidebar } from "@/components/Sidebar";
import { GlobalToast } from "@/components/forms";
import { PageNav, Topbar } from "@/components/Topbar";
import { requireManager } from "@/lib/auth";
import { getSettings, isDemo } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const manager = await requireManager();
  const settings = await getSettings();
  return (
    <div className="shell">
      <Sidebar salon={settings.salon_name} demo={isDemo()} />
      <div className="main-col">
        <Topbar manager={manager.name} />
        <main className="main">
          {children}
          <PageNav />
        </main>
        <GlobalToast />
      </div>
    </div>
  );
}
