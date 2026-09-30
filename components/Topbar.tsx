"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition } from "react";
import { ChevronDown, LogOut, MessageCircle, Settings, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/auth-actions";
import { Icon } from "./Icon";
import { FLAT_NAV, isActive, QUICK_ACTIONS } from "@/lib/nav";

/** Sticky bar on every page: back, home, the everyday jobs, and the signed-in manager. */
export function Topbar({ manager }: { manager: string }) {
  const router = useRouter();
  const path = usePathname();
  const here = FLAT_NAV.find((n) => isActive(path, n.href));

  return (
    <div className="topbar">
      <div className="topbar-row">
        <button type="button" className="btn nav-btn" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} aria-label="Go back">
          <Icon name="back" /> Back
        </button>
        {path !== "/" && (
          <Link href="/" className="btn nav-btn" aria-label="Go to overview">
            <Icon name="home" /> Home
          </Link>
        )}
        <span className="topbar-here">{here?.label ?? (path === "/account" ? "My account" : "")}</span>
        <div className="topbar-spacer" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="btn nav-btn ghost" aria-label="Account menu">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{manager.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              {manager}
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block text-sm font-semibold">{manager}</span>
              <span className="block text-xs font-normal text-muted-foreground">Manager</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="py-2.5 text-[15px]">
              <Link href="/account">
                <UserRound className="mr-2 size-4" /> My account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="py-2.5 text-[15px]">
              <Link href="/settings">
                <Settings className="mr-2 size-4" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="py-2.5 text-[15px]">
              <Link href="/settings/whatsapp">
                <MessageCircle className="mr-2 size-4" /> WhatsApp connection
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="py-2.5 text-[15px]" onSelect={() => startTransition(() => signOut())}>
              <LogOut className="mr-2 size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {path !== "/" && (
      <nav className="quick-row" aria-label="Quick actions">
        {QUICK_ACTIONS.map((q) => (
          <Link key={q.href} href={q.href} className="quick-btn">
            <span className="quick-icon"><Icon name={q.icon} /></span>
            {q.label}
          </Link>
        ))}
      </nav>
      )}
    </div>
  );
}

/** Large previous / next buttons at the foot of every page, following the sidebar order. */
export function PageNav() {
  const path = usePathname();
  const i = FLAT_NAV.findIndex((n) => isActive(path, n.href));
  if (i < 0) return null;
  const prev = FLAT_NAV[i - 1];
  const next = FLAT_NAV[i + 1];
  return (
    <nav className="page-nav" aria-label="Page navigation">
      {prev ? (
        <Link href={prev.href} className="page-nav-btn">
          <Icon name="back" size={22} />
          <span>
            <small>Previous</small>
            {prev.label}
          </span>
        </Link>
      ) : <span />}
      {next && (
        <Link href={next.href} className="page-nav-btn next">
          <span>
            <small>Next</small>
            {next.label}
          </span>
          <Icon name="next" size={22} />
        </Link>
      )}
    </nav>
  );
}
