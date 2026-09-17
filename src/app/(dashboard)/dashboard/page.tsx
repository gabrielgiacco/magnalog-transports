"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Topbar } from "@/components/layout/Topbar";
import {
  HeroBanner, KpiTile, AlertPill, Panel, StatusBar, TH, TD, StatusChip,
} from "@/components/dashboard/DashboardWidgets";
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

const saudacao = () => {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

/** Frase do banner montada so com o que a API ja devolve. */
function resumoDoDia(k: any) {
  const partes = [`${k?.emAndamento ?? 0} entrega${k?.emAndamento === 1 ? "" : "s"} ativa${k?.emAndamento === 1 ? "" : "s"}`];
  if (k?.atrasadas > 0) partes.push(`${k.atrasadas} com prazo vencido`);
  if (k?.ocorrenciasAbertas > 0) partes.push(`${k.ocorrenciasAbertas} ocorrência${k.ocorrenciasAbertas === 1 ? "" : "s"} em aberto`);
  if (partes.length === 1) return `${partes[0]} — nenhum atraso nem ocorrência em aberto.`;
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}.`;
}

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

  const ativas = kpis?.emAndamento ?? 0;
  const noPrazo = Math.max(ativas - (kpis?.atrasadas ?? 0), 0);
  const pctNoPrazo = ativas ? Math.round((noPrazo / ativas) * 100) : 100;
  const primeiroNome = session?.user?.name?.split(" ")[0] || "";

  return (
    <>
      <Topbar title="Dashboard" subtitle={new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })} />
      <div className="flex-1 overflow-y-auto ml-glow">
        <main className="max-w-[1320px] mx-auto px-4 sm:px-6 py-5 sm:py-6 pb-11 space-y-4 animate-fadeIn">
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-[13px] animate-pulse" style={{ background: "var(--surface)" }} />
              ))}
            </div>
          ) : (
            <>
              <HeroBanner
                greeting={`${saudacao()}${primeiroNome ? `, ${primeiroNome}` : ""}.`}
                resumo={resumoDoDia(kpis)}
                destaques={[
                  { label: "NO PRAZO", value: `${pctNoPrazo}%`, hint: `${noPrazo} de ${ativas} ativas`, tone: "accent" },
                  { label: "ENTREGUES HOJE", value: String(kpis?.entreguesHoje ?? 0), hint: "no dia de hoje", tone: "cyan" },
                ]}
              />

              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiTile label="Em andamento" value={String(ativas)} hint="entregas ativas" icon={<Truck size={14} />} tone="cyan" />
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
                <Panel className="lg:col-span-2 min-w-0" title="Entregas por dia" subtitle="Últimos 7 dias">
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
                      <Bar dataKey="entregas" radius={[5, 5, 0, 0]}>
                        {barData.map((_: any, i: number) => (
                          <Cell key={i} fill={i === barData.length - 1 ? "var(--accent)" : "var(--border2)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel className="min-w-0" title="Por status" subtitle={`${totalStatus} ativas`}>
                  <div className="space-y-3">
                    {porStatus?.map((s: any) => (
                      <StatusBar
                        key={s.status}
                        label={STATUS_LABELS[s.status] || s.status}
                        count={s._count}
                        pct={totalStatus ? Math.round((s._count / totalStatus) * 100) : 0}
                        color={STATUS_COLORS[s.status] || "#737373"}
                      />
                    ))}
                  </div>
                </Panel>
              </section>

              <Panel title="Últimas entregas" subtitle={`${ultimasEntregas?.length || 0} recentes`}>
                <div className="overflow-x-auto -mx-5 sm:mx-0">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr>
                        <TH>NF</TH>
                        <TH>Cliente</TH>
                        <TH className="hidden md:table-cell">Cidade</TH>
                        <TH className="hidden lg:table-cell">Motorista</TH>
                        <TH>Status</TH>
                        <TH className="hidden md:table-cell !text-right">Agendado</TH>
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
                            <StatusChip
                              label={STATUS_LABELS[e.status] || e.status}
                              color={STATUS_COLORS[e.status] || "#737373"}
                            />
                          </TD>
                          <TD className="hidden md:table-cell text-right">
                            <span className="text-[11.5px] font-mono" style={{ color: "var(--text3)" }}>
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
