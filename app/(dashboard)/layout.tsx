import { Sidebar } from "@/components/Sidebar";
import { GlobalToast } from "@/components/forms";
import { PageNav, Topbar } from "@/components/Topbar";
import { requireManager } from "@/lib/auth";
import { getSettings, isDemo } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [manager, settings] = await Promise.all([requireManager(), getSettings()]);
  return (
    <div className="shell">
      <Sidebar salon={settings.salon_name} demo={isDemo()} role={manager.role} />
      <div className="main-col">
        <Topbar manager={manager.name} role={manager.role} />
        <main className="main">
          {children}
          <PageNav role={manager.role} />
        </main>
        <GlobalToast />
      </div>
    </div>
  );
}
