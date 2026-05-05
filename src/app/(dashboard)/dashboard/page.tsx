"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Topbar } from "@/components/layout/Topbar";
import { KpiCard, Card, Loading, StatusBadge, Table, Th, Td, Tr } from "@/components/ui";
import { formatCurrency, formatDate, formatWeight } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { AlertTriangle, TrendingUp, TrendingDown, RefreshCw, Package, Users, Truck } from "lucide-react";

const TOOLTIP_STYLE = {
  contentStyle: { background: "#162030", border: "1px solid #273d58", borderRadius: 8, color: "#f1f5f9", fontSize: 12 },
  cursor: { fill: "rgba(249,115,22,0.05)" },
};

const STATUS_LABELS: Record<string, string> = {
  PROGRAMADO: "Programado", EM_SEPARACAO: "Em Separação", CARREGADO: "Carregado",
  EM_ROTA: "Em Rota", ENTREGUE: "Entregue", FINALIZADO: "Finalizado", OCORRENCIA: "Ocorrência",
};

const STATUS_COLORS: Record<string, string> = {
  PROGRAMADO: "#f59e0b", EM_SEPARACAO: "#3b82f6", CARREGADO: "#8b5cf6",
  EM_ROTA: "#6366f1", ENTREGUE: "#10b981", FINALIZADO: "#64748b", OCORRENCIA: "#ef4444",
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      if ((session.user as any).role === "CLIENTE") {
        router.push("/portal");
      } else {
        fetch("/api/dashboard")
          .then((r) => r.json())
          .then(setData)
          .finally(() => setLoading(false));
      }
    }
  }, [session, router]);

  if (loading) return <><Topbar title="Dashboard" /><Loading /></>;

  const { kpis, porStatus, ultimasEntregas, graficoSemana } = data || {};

  const statusLabels: Record<string, string> = {
    PROGRAMADO: "Programado", EM_SEPARACAO: "Em Sep.", CARREGADO: "Carregado",
    EM_ROTA: "Em Rota", ENTREGUE: "Entregue", OCORRENCIA: "Ocorrência",
  };
  const statusColors: Record<string, string> = {
    PROGRAMADO: "#f59e0b", EM_SEPARACAO: "#3b82f6", CARREGADO: "#8b5cf6",
    EM_ROTA: "#6366f1", ENTREGUE: "#10b981", OCORRENCIA: "#ef4444",
  };

  const barData = graficoSemana?.map((d: any) => ({
    data: new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
    entregas: d.count,
  })) || [];

  const statusData = porStatus?.map((s: any) => ({
    name: statusLabels[s.status] || s.status,
    value: s._count,
    color: statusColors[s.status] || "#64748b",
  })) || [];

  return (
    <>
      <Topbar title="Dashboard" subtitle={`${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}`} />
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <KpiCard label="Em Andamento" value={kpis?.emAndamento ?? 0} icon="🚛" color="#f97316" sub="entregas ativas" />
          <KpiCard label="Atrasadas" value={kpis?.atrasadas ?? 0} icon="⚠️" color="#ef4444"
            sub={kpis?.atrasadas > 0 ? "requer atenção" : "nenhuma"} />
          <KpiCard label="Frete do Mês" value={formatCurrency(kpis?.freteMes ?? 0)} icon="💰" color="#10b981"
            sub={`Saldo: ${formatCurrency(kpis?.saldoPendente ?? 0)}`} />
          <KpiCard label="Peso Transportado" value={formatWeight(kpis?.pesoMes ?? 0)} icon="⚖️" color="#3b82f6"
            sub="este mês" />
        </div>

        {/* Alerts */}
        {(kpis?.atrasadas > 0 || kpis?.ocorrenciasAbertas > 0) && (
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {kpis?.atrasadas > 0 && (
              <div className="flex-1 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm"
                style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", color: "#ef4444" }}>
                <AlertTriangle size={14} className="flex-shrink-0" />
                <span><strong>{kpis.atrasadas}</strong> entrega(s) com prazo vencido</span>
              </div>
            )}
            {kpis?.ocorrenciasAbertas > 0 && (
              <div className="flex-1 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm"
                style={{ background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.25)", color: "#f59e0b" }}>
                <AlertTriangle size={14} className="flex-shrink-0" />
                <span><strong>{kpis.ocorrenciasAbertas}</strong> ocorrência(s) em aberto</span>
              </div>
            )}
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="font-head text-sm font-bold">Entregas por Dia</div>
              <span className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: "var(--surface2)", color: "var(--text3)", border: "1px solid var(--border)" }}>7 dias</span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={barData} barSize={20}>
                <XAxis dataKey="data" tick={{ fontSize: 10, fill: "var(--text3)", fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--text)", fontSize: 12 }} cursor={false} />
                <Bar dataKey="entregas" radius={[4, 4, 0, 0]}>
                  {barData.map((_: any, i: number) => (
                    <Cell key={i} fill={i === barData.length - 1 ? "var(--accent)" : "#273d58"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <div className="font-head text-sm font-bold mb-4">Por Status</div>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-x-4 gap-y-2.5">
              {statusData.map((s: any) => {
                const total = statusData.reduce((a: number, b: any) => a + b.value, 0);
                const pct = total ? Math.round((s.value / total) * 100) : 0;
                return (
                  <div key={s.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: "var(--text2)" }}>{s.name}</span>
                      <span className="text-xs font-mono" style={{ color: s.color }}>{s.value}</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "var(--surface2)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Últimas entregas */}
        <Card>
          <div className="font-head text-sm font-bold mb-4">Últimas Entregas</div>
          {/* Mobile: card list */}
          <div className="block sm:hidden space-y-2">
            {ultimasEntregas?.map((e: any) => (
              <div key={e.id}
                onClick={() => window.location.href = `/entregas/${e.id}`}
                className="rounded-lg p-3 cursor-pointer transition-colors hover:bg-slate-50 active:bg-slate-100"
                style={{ border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[11px]" style={{ color: "#3b82f6" }}>
                    {e.notas && e.notas.length > 0 ? e.notas.map((n: any) => n.numero).join(", ") : e.codigo}
                  </span>
                  <StatusBadge status={e.status} />
                </div>
                <div className="text-sm font-medium truncate">{e.razaoSocial}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px]" style={{ color: "var(--text3)" }}>{e.cidade}{e.uf ? ` - ${e.uf}` : ""}</span>
                  <span className="text-[11px] font-mono" style={{ color: "var(--text3)" }}>{formatDate(e.dataAgendada)}</span>
                </div>
                {e.motorista?.nome && (
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text3)" }}>
                    <Truck size={10} className="inline mr-1" />{e.motorista.nome}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block">
            <Table>
              <thead>
                <tr>
                  <Th>NF</Th><Th>Cliente</Th><Th className="hidden md:table-cell">Cidade</Th><Th className="hidden lg:table-cell">Motorista</Th>
                  <Th className="hidden lg:table-cell">Notas</Th><Th>Status</Th><Th className="hidden md:table-cell">Agendado</Th>
                </tr>
              </thead>
              <tbody>
                {ultimasEntregas?.map((e: any) => (
                  <Tr key={e.id} onClick={() => window.location.href = `/entregas/${e.id}`}>
                    <Td>
                      <span className="font-mono text-[11px]" style={{ color: "#3b82f6" }}>
                        {e.notas && e.notas.length > 0 ? e.notas.map((n: any) => n.numero).join(", ") : "—"}
                      </span>
                    </Td>
                    <Td><span className="font-medium text-sm">{e.razaoSocial}</span></Td>
                    <Td className="hidden md:table-cell"><span className="text-xs" style={{ color: "var(--text2)" }}>{e.cidade}{e.uf ? ` — ${e.uf}` : ""}</span></Td>
                    <Td className="hidden lg:table-cell"><span className="text-xs" style={{ color: "var(--text2)" }}>{e.motorista?.nome || "—"}</span></Td>
                    <Td className="hidden lg:table-cell"><span className="font-mono text-xs">{e._count?.notas ?? 0}</span></Td>
                    <Td><StatusBadge status={e.status} /></Td>
                    <Td className="hidden md:table-cell"><span className="text-xs font-mono" style={{ color: "var(--text3)" }}>{formatDate(e.dataAgendada)}</span></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      </div>
    </>
  );
}
