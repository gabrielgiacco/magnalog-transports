"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Topbar } from "@/components/layout/Topbar";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AlertTriangle, ArrowUpRight, Truck, DollarSign, Weight } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  PROGRAMADO: "Programado", EM_SEPARACAO: "Em Separação", CARREGADO: "Carregado",
  EM_ROTA: "Em Rota", ENTREGUE: "Entregue", FINALIZADO: "Finalizado", OCORRENCIA: "Ocorrência",
};

const STATUS_COLORS: Record<string, string> = {
  PROGRAMADO: "#f5a524", EM_SEPARACAO: "#3b82f6", CARREGADO: "#8b5cf6",
  EM_ROTA: "#6366f1", ENTREGUE: "#00d084", FINALIZADO: "#737373", OCORRENCIA: "#ff4d4f",
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);
const fmtKG = (v: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v || 0) + " kg";
const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";

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

  const { kpis, porStatus, ultimasEntregas, graficoSemana } = data || {};

  const barData =
    graficoSemana?.map((d: any) => ({
      data: new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
      entregas: d.count,
    })) || [];

  const totalStatus = porStatus?.reduce((s: number, x: any) => s + x._count, 0) || 0;

  return (
    <>
      <Topbar title="Dashboard" subtitle={new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })} />
      <div className="flex-1 overflow-y-auto">
        <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-8">
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: "var(--surface)" }} />
              ))}
            </div>
          ) : (
            <>
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiTile label="Em andamento" value={String(kpis?.emAndamento ?? 0)} hint="entregas ativas" icon={<Truck size={14} />} />
                <KpiTile
                  label="Atrasadas"
                  value={String(kpis?.atrasadas ?? 0)}
                  hint={kpis?.atrasadas > 0 ? "requer atenção" : "nenhuma"}
                  icon={<AlertTriangle size={14} />}
                  tone={kpis?.atrasadas > 0 ? "danger" : "neutral"}
                />
                <KpiTile
                  label="Frete do mês"
                  value={fmtBRL(kpis?.freteMes ?? 0)}
                  hint={`saldo ${fmtBRL(kpis?.saldoPendente ?? 0)}`}
                  icon={<DollarSign size={14} />}
                  tone="accent"
                />
                <KpiTile label="Peso transportado" value={fmtKG(kpis?.pesoMes ?? 0)} hint="este mês" icon={<Weight size={14} />} />
              </section>

              {(kpis?.atrasadas > 0 || kpis?.ocorrenciasAbertas > 0) && (
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {kpis?.atrasadas > 0 && (
                    <AlertPill tone="danger" icon={<AlertTriangle size={13} />}>
                      <b>{kpis.atrasadas}</b> entrega{kpis.atrasadas === 1 ? "" : "s"} com prazo vencido
                    </AlertPill>
                  )}
                  {kpis?.ocorrenciasAbertas > 0 && (
                    <AlertPill tone="warning" icon={<AlertTriangle size={13} />}>
                      <b>{kpis.ocorrenciasAbertas}</b> ocorrência{kpis.ocorrenciasAbertas === 1 ? "" : "s"} em aberto
                    </AlertPill>
                  )}
                </section>
              )}

              <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Panel className="lg:col-span-2" title="Entregas por dia" subtitle="Últimos 7 dias">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={barData} barSize={28}>
                      <XAxis
                        dataKey="data"
                        tick={{ fontSize: 10, fill: "var(--text3)", fontFamily: "IBM Plex Mono, monospace" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface2)",
                          border: "1px solid var(--border2)",
                          borderRadius: 8,
                          color: "var(--text)",
                          fontSize: 12,
                          boxShadow: "0 8px 24px rgba(0,0,0,.4)",
                        }}
                        cursor={{ fill: "rgba(249,115,22,.06)" }}
                      />
                      <Bar dataKey="entregas" radius={[4, 4, 0, 0]}>
                        {barData.map((_: any, i: number) => (
                          <Cell key={i} fill={i === barData.length - 1 ? "var(--accent)" : "var(--border)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel title="Por status" subtitle={`${totalStatus} entregas ativas`}>
                  <div className="space-y-3">
                    {porStatus?.map((s: any) => {
                      const pct = totalStatus ? Math.round((s._count / totalStatus) * 100) : 0;
                      const color = STATUS_COLORS[s.status] || "#737373";
                      return (
                        <div key={s.status}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs" style={{ color: "var(--text2)" }}>{STATUS_LABELS[s.status] || s.status}</span>
                            <span className="text-xs font-mono" style={{ color }}>
                              {s._count}
                              <span className="ml-1.5" style={{ color: "var(--text3)" }}>{pct}%</span>
                            </span>
                          </div>
                          <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              </section>

              <Panel title="Últimas entregas" subtitle={`${ultimasEntregas?.length || 0} recentes`}>
                <div className="overflow-x-auto -mx-5 sm:mx-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <TH>NF</TH>
                        <TH>Cliente</TH>
                        <TH className="hidden md:table-cell">Cidade</TH>
                        <TH className="hidden lg:table-cell">Motorista</TH>
                        <TH>Status</TH>
                        <TH className="hidden md:table-cell text-right">Agendado</TH>
                        <TH className="w-8"></TH>
                      </tr>
                    </thead>
                    <tbody>
                      {ultimasEntregas?.map((e: any) => (
                        <tr
                          key={e.id}
                          onClick={() => (window.location.href = `/entregas/${e.id}`)}
                          className="cursor-pointer transition-colors group"
                          style={{ borderBottom: "1px solid var(--border)" }}
                          onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--surface2)")}
                          onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
                        >
                          <TD>
                            <span className="font-mono text-xs" style={{ color: "var(--accent)" }}>
                              {e.notas && e.notas.length > 0 ? e.notas.map((n: any) => n.numero).join(", ") : "—"}
                            </span>
                          </TD>
                          <TD>
                            <span className="font-medium">{e.razaoSocial}</span>
                          </TD>
                          <TD className="hidden md:table-cell">
                            <span className="text-xs" style={{ color: "var(--text2)" }}>
                              {e.cidade}{e.uf ? ` — ${e.uf}` : ""}
                            </span>
                          </TD>
                          <TD className="hidden lg:table-cell">
                            <span className="text-xs" style={{ color: "var(--text2)" }}>
                              {e.motorista?.nome || "—"}
                            </span>
                          </TD>
                          <TD>
                            <StatusChip status={e.status} />
                          </TD>
                          <TD className="hidden md:table-cell text-right">
                            <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>
                              {fmtDate(e.dataAgendada)}
                            </span>
                          </TD>
                          <TD>
                            <ArrowUpRight
                              size={14}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: "var(--text2)" }}
                            />
                          </TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </main>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Locals — self-contained, sem depender de src/components/ui
   ═══════════════════════════════════════════════════════════════════════════════ */

function KpiTile({
  label, value, hint, icon, tone = "neutral",
}: {
  label: string; value: string; hint?: string; icon?: React.ReactNode;
  tone?: "neutral" | "accent" | "danger" | "warning";
}) {
  const toneColor =
    tone === "accent" ? "var(--accent)"
      : tone === "danger" ? "#ff4d4f"
      : tone === "warning" ? "#f5a524"
      : "var(--text)";

  return (
    <div className="p-4 rounded-lg transition-colors hover:border-neutral-700"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "var(--text3)" }}>{label}</span>
        {icon && <span style={{ color: "var(--text3)" }}>{icon}</span>}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums" style={{ color: toneColor }}>{value}</div>
      {hint && <div className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>{hint}</div>}
    </div>
  );
}

function AlertPill({ tone, icon, children }: { tone: "danger" | "warning"; icon: React.ReactNode; children: React.ReactNode }) {
  const bg = tone === "danger" ? "rgba(255,77,79,.08)" : "rgba(245,165,36,.08)";
  const border = tone === "danger" ? "rgba(255,77,79,.25)" : "rgba(245,165,36,.25)";
  const color = tone === "danger" ? "#ff4d4f" : "#f5a524";
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm" style={{ background: bg, border: `1px solid ${border}`, color }}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

function Panel({ title, subtitle, className = "", children }: { title: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg p-5 ${className}`} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle && <span className="text-xs" style={{ color: "var(--text3)" }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function TH({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left text-[10px] uppercase tracking-wider font-semibold py-2.5 px-3 ${className}`} style={{ color: "var(--text3)" }}>
      {children}
    </th>
  );
}

function TD({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`py-3 px-3 ${className}`} style={{ color: "var(--text)" }}>{children}</td>;
}

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#737373";
  const label = STATUS_LABELS[status] || status;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
      style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: color }} />
      {label.toUpperCase()}
    </span>
  );
}
