"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { isActive, NAV } from "@/lib/nav";

export function Sidebar({ salon, demo }: { salon: string; demo: boolean }) {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <div className="brand-mark">O</div>
        <div>
          <div className="brand-name">Ownicx for salons</div>
          <div className="brand-sub">{salon}</div>
        </div>
      </Link>
      {NAV.map((g) => (
        <nav className="nav-group" key={g.label} aria-label={g.label}>
          <div className="nav-label">{g.label}</div>
          {g.items.map((it) => {
            const active = isActive(path, it.href);
            return (
              <Link key={it.href} href={it.href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon name={it.icon} />
                {it.label}
              </Link>
            );
          })}
        </nav>
      ))}
      <div className="sidebar-foot">
        {demo ? "Demo data · connect Supabase to go live" : "Connected to Supabase"}
        <div className="mt-8">
          Powered by <strong>Osiq Solutions</strong>
        </div>
      </div>
    </aside>
  );
}
