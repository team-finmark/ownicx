import type { Metadata } from "next";
import { SignInForm } from "./SignInForm";
import { DEMO_FRONT_DESK, DEMO_MANAGER, isDemo } from "@/lib/db";

export const metadata: Metadata = { title: "Sign in · Ownicx for salons" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  const demo = isDemo();
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand" style={{ padding: 0, marginBottom: 28 }}>
          <div className="brand-mark" style={{ width: 48, height: 48, fontSize: 24, borderRadius: 14 }}>O</div>
          <div>
            <div className="brand-name" style={{ fontSize: 20 }}>Ownicx for salons</div>
            <div className="brand-sub" style={{ fontSize: 13 }}>Powered by Osiq Solutions</div>
          </div>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Manager sign in</h1>
        <p className="text-2" style={{ marginTop: 6, marginBottom: 28, fontSize: 16 }}>Use the name and password set up for your salon.</p>
        <SignInForm next={next} />
        {demo && (
          <div className="callout info" style={{ marginTop: 24, fontSize: 14 }}>
            <b style={{ color: "var(--text)" }}>Demo mode.</b> Sign in as the owner with name <b>{DEMO_MANAGER.name}</b>, or as the front desk with <b>{DEMO_FRONT_DESK.name}</b> — password <b>{DEMO_MANAGER.password}</b> for both. After you connect Supabase, create real logins with <span className="mono">npm run manager</span>.
          </div>
        )}
      </div>
    </div>
  );
}
