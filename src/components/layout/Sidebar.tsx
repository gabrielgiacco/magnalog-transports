"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useLayoutStore } from "@/hooks/useLayoutStore";
import { useTheme } from "@/hooks/useTheme";
import { QUALIDADE_ENABLED } from "@/lib/features";
import { navGroups, type NavItem } from "./nav-items";
import { X, ChevronLeft, ChevronRight as ChevronRightIcon, Sun, Moon, LogOut } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isSidebarOpen, isSidebarCollapsed, toggleCollapse, setSidebarOpen } = useLayoutStore();
  const role = (session?.user as any)?.role || "OPERACIONAL";
  const { theme, toggle: toggleTheme, mounted } = useTheme();
  const isDark = mounted && theme === "dark";
  // "Recolher" e coisa do desktop (o botao so existe em lg), mas o estado fica
  // salvo no navegador: sem isto, quem recolheu numa tela grande via a gaveta
  // do celular com 72px e os botoes de baixo vazando. Abaixo de lg, sempre aberto.
  const soDesktop = isSidebarCollapsed ? "lg:hidden" : "";

  const canSee = (item: NavItem) => {
    if (item.href === "/qualidade" && !QUALIDADE_ENABLED) return false;
    return item.roles.includes(role);
  };

  // Grupo sem nenhum item visivel para o papel atual nao rende o cabecalho.
  const groups = navGroups
    .map((g) => ({ label: g.label, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 lg:relative flex flex-col transition-all duration-300 ease-in-out
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${isSidebarCollapsed ? "w-[248px] min-w-[248px] lg:w-[72px] lg:min-w-[72px]" : "w-[248px] min-w-[248px]"}
        `}
        style={{
          background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-bg2) 100%)",
          borderRight: "1px solid var(--sidebar-border)",
          color: "var(--sidebar-fg)",
        }}
      >
        <div className="ml-rule-v" />

        {/* Usuario + recolher */}
        <div
          className={`flex gap-2.5 px-3.5 py-4 min-h-[82px] items-center justify-between ${isSidebarCollapsed ? "lg:flex-col lg:justify-start" : ""}`}
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div
              className="relative flex items-center justify-center w-9 h-9 min-w-[36px] rounded-full font-head text-[13px] font-black text-white"
              style={{ background: "linear-gradient(140deg,#f97316,#c2410c)", boxShadow: "0 0 16px rgba(249,115,22,.35)" }}
            >
              {session?.user?.name?.[0]?.toUpperCase() || "?"}
              <span
                className="absolute -right-px -bottom-px w-[9px] h-[9px] rounded-full bg-emerald-500"
                style={{ border: "2px solid var(--sidebar-bg)" }}
              />
            </div>
            <div className={`min-w-0 overflow-hidden ${soDesktop}`}>
              <div className="font-head text-[13px] font-extrabold tracking-tight text-white truncate">
                {session?.user?.name || "Usuário"}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="w-1 h-1 flex-shrink-0 rounded-full animate-pulse-dot"
                  style={{ background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)" }}
                />
                <span className="font-mono text-[9px] tracking-[.16em] whitespace-nowrap" style={{ color: "var(--sidebar-group)" }}>
                  {role}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={toggleCollapse}
            title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            className="hidden lg:flex items-center justify-center w-8 h-8 min-w-[32px] rounded-[9px] transition-colors hover:text-[var(--accent)]"
            style={{ border: "1px solid var(--sidebar-border)", background: "var(--sidebar-hover)", color: "var(--sidebar-muted)" }}
          >
            {isSidebarCollapsed ? <ChevronRightIcon size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden flex items-center justify-center w-8 h-8 min-w-[32px] rounded-[9px] transition-colors"
            style={{ border: "1px solid var(--sidebar-border)", background: "var(--sidebar-hover)", color: "var(--sidebar-muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 flex flex-col gap-3.5">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-[3px]">
              <div
                className={`px-2 pt-1.5 pb-1 font-mono text-[9px] tracking-[.2em] uppercase ${soDesktop}`}
                style={{ color: "var(--sidebar-group)" }}
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    title={isSidebarCollapsed ? item.label : ""}
                    className={`
                      flex items-center gap-[11px] px-2.5 py-2.5 rounded-[11px] text-[13px] font-medium transition-colors
                      ${active ? "" : "hover:bg-white/5 hover:text-slate-200"}
                    `}
                    style={
                      active
                        ? { background: "rgba(249,115,22,.12)", color: "var(--accent)", border: "1px solid rgba(249,115,22,.32)" }
                        : { color: "var(--sidebar-muted)", border: "1px solid transparent" }
                    }
                  >
                    <item.icon size={18} className="flex-shrink-0" />
                    <span className={`flex-1 truncate ${soDesktop}`}>{item.label}</span>
                    {active && (
                      <span className={`w-1.5 h-1.5 rounded-full ${soDesktop}`} style={{ background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }} />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Celular: tema e Sair sairam da barra do topo para o titulo caber.
            De md para cima eles continuam la, entao aqui ficam escondidos. */}
        <div className="md:hidden flex items-center gap-2 px-3 py-3" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          <button
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[13px] font-medium"
            style={{ border: "1px solid var(--sidebar-border)", background: "var(--sidebar-hover)", color: "var(--sidebar-muted)" }}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
            {isDark ? "Tema claro" : "Tema escuro"}
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[13px] font-medium"
            style={{ border: "1px solid var(--sidebar-border)", background: "var(--sidebar-hover)", color: "var(--sidebar-muted)" }}
          >
            <LogOut size={15} /> Sair
          </button>
        </div>

        {/* Marca */}
        <div
          className={`flex items-center gap-2.5 p-3.5 ${isSidebarCollapsed ? "lg:justify-center" : ""}`}
          style={{ borderTop: "1px solid var(--sidebar-border)" }}
        >
          <img src="/logo.png" alt="MAGNA LOG" className="h-5 w-auto object-contain bg-white px-1.5 py-1 rounded" />
          <span className={`font-mono text-[9px] tracking-[.14em] whitespace-nowrap ${soDesktop}`} style={{ color: "var(--sidebar-group)" }}>
            TMS v1.0
          </span>
        </div>
      </aside>
    </>
  );
}
