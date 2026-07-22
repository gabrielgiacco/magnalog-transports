"use client";
import { signOut } from "next-auth/react";
import { LogOut, Menu } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { useLayoutStore } from "@/hooks/useLayoutStore";

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  const { toggleSidebar } = useLayoutStore();

  return (
    <header
      className="h-[64px] flex items-center justify-between px-4 lg:px-6 flex-shrink-0 sticky top-0 z-30 shadow-sm"
      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3">
        <button 
          onClick={toggleSidebar}
          className="lg:hidden p-2 rounded-lg hover:bg-neutral-800 transition-colors"
          style={{ color: "var(--text2)" }}
        >
          <Menu size={22} />
        </button>
        <div>
          <h1 className="font-head text-[16px] lg:text-[18px] font-bold tracking-tight leading-tight">{title}</h1>
          {subtitle && (
            <p className="hidden xs:block text-[10px] lg:text-xs mt-0.5" style={{ color: "var(--text3)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <div className="hidden sm:block">
          <GlobalSearch />
        </div>
        <ThemeToggle />
        <NotificationBell />
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:opacity-80"
          style={{ background: "var(--surface2)", color: "var(--text2)", border: "1px solid var(--border)" }}
        >
          <LogOut size={13} />
          Sair
        </button>
      </div>
    </header>
  );
}
