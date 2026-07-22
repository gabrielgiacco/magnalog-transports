"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLayoutStore } from "@/hooks/useLayoutStore";
import { QUALIDADE_ENABLED } from "@/lib/features";
import {
  LayoutDashboard, Package, Calendar, Users, FileText,
  DollarSign, Settings, BarChart2, Wallet, FileUp,
  Truck, Globe, Columns, Route, ShieldCheck, AlertTriangle, Map,
  Layers, X, ChevronLeft, ChevronRight as ChevronRightIcon, Warehouse, Shield,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN","FINANCEIRO","OPERACIONAL"] },
  { href: "/entregas", label: "Entregas", icon: Package, roles: ["ADMIN","FINANCEIRO","OPERACIONAL","CONFERENTE"] },
  { href: "/agendamentos", label: "Agendamentos", icon: Calendar, roles: ["ADMIN","FINANCEIRO","OPERACIONAL","CONFERENTE"] },
  { href: "/importacao", label: "Documentos Fiscais", icon: FileUp, roles: ["ADMIN","OPERACIONAL","FINANCEIRO"] },
  { href: "/kanban", label: "Kanban", icon: Columns, roles: ["ADMIN","OPERACIONAL","CONFERENTE"] },
  { href: "/rotas", label: "Rotas", icon: Route, roles: ["ADMIN","OPERACIONAL"] },
  { href: "/planejador-rotas", label: "Planejador", icon: Map, roles: ["ADMIN","OPERACIONAL"] },
  { href: "/frota", label: "Frota", icon: Truck, roles: ["ADMIN","OPERACIONAL","FINANCEIRO"] },
  { href: "/financeiro", label: "Financeiro", icon: DollarSign, roles: ["ADMIN","FINANCEIRO"] },
  { href: "/faturamento", label: "Faturamento", icon: Wallet, roles: ["ADMIN","FINANCEIRO"] },
  { href: "/relatorios", label: "Relatórios", icon: BarChart2, roles: ["ADMIN","FINANCEIRO"] },
  { href: "/avarias", label: "Avarias e Ocorrências", icon: AlertTriangle, roles: ["ADMIN","OPERACIONAL","CONFERENTE"] },
  { href: "/paletes", label: "Paletes", icon: Layers, roles: ["ADMIN","OPERACIONAL","FINANCEIRO"] },
  { href: "/configuracoes/normas", label: "Normas Paletização", icon: Warehouse, roles: ["ADMIN","OPERACIONAL","FINANCEIRO"] },
  { href: "/qualidade", label: "Qualidade", icon: ShieldCheck, roles: ["ADMIN"] },
  { href: "/portal", label: "Portal Cliente", icon: Globe, roles: ["ADMIN","CLIENTE"] },
  { href: "/usuarios", label: "Usuários", icon: Users, roles: ["ADMIN"] },
  { href: "/auditoria", label: "Auditoria", icon: Shield, roles: ["ADMIN"] },
  { href: "/configuracoes", label: "Configurações", icon: Settings, roles: ["ADMIN","FINANCEIRO","OPERACIONAL"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isSidebarOpen, isSidebarCollapsed, toggleSidebar, toggleCollapse, setSidebarOpen } = useLayoutStore();
  const role = (session?.user as any)?.role || "OPERACIONAL";

  const allowed = navItems.filter((item) => {
    if (item.href === "/qualidade" && !QUALIDADE_ENABLED) return false;
    return item.roles.includes(role);
  });

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
          fixed inset-y-0 left-0 z-50 lg:static flex flex-col transition-all duration-300 ease-in-out
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${isSidebarCollapsed ? "w-[70px] min-w-[70px]" : "w-[240px] min-w-[240px]"}
        `}
        style={{ background: "#0a0a0a", borderRight: "1px solid #262626", color: "#ededed" }}
      >
        {/* Logo & Toggle */}
        <div className="px-4 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #262626" }}>
          {!isSidebarCollapsed && (
            <div className="flex-1 overflow-hidden transition-all duration-300">
              <img src="/logo.png" alt="MAGNALOG" className="h-8 w-auto object-contain bg-white px-2 py-1 rounded" />
              <div className="text-[10px] mt-1 font-mono tracking-widest text-slate-400">
                TMS SYSTEM
              </div>
            </div>
          )}
          
          <button 
            onClick={toggleCollapse}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/5 transition-colors text-slate-400"
          >
            {isSidebarCollapsed ? <ChevronRightIcon size={18} /> : <ChevronLeft size={18} />}
          </button>

          {/* Mobile Close Button */}
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/5 transition-colors text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {allowed.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                onClick={() => setSidebarOpen(false)}
                title={isSidebarCollapsed ? item.label : ""}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative
                  ${active ? "text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"}
                `}
                style={active ? { background: "rgba(249,115,22,0.1)", color: "var(--accent)" } : {}}
              >
                <item.icon size={18} className={`flex-shrink-0 ${active ? "text-[var(--accent)]" : "group-hover:text-slate-200"}`} />
                {!isSidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                {active && !isSidebarCollapsed && <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className={`p-4 transition-all duration-300 ${isSidebarCollapsed ? "items-center" : ""}`} style={{ borderTop: "1px solid #262626" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 min-w-[36px] rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-neutral-800"
              style={{ background: "var(--accent)" }}>
              {session?.user?.name?.[0] || "?"}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0 transition-opacity duration-300">
                <div className="text-xs font-bold truncate text-slate-200">{session?.user?.name || "Usuário"}</div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{role}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
