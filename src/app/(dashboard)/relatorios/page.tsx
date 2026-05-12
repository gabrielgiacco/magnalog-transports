"use client";
import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card, Loading, Button, Modal } from "@/components/ui";
import { formatCurrency, formatWeight, formatDate } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, Package, DollarSign, Weight, Users, Download, ChevronRight, X, Truck, MapPin } from "lucide-react";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const STATUS_COLORS: Record<string,string> = {
  PROGRAMADO:"#f59e0b",EM_SEPARACAO:"#3b82f6",CARREGADO:"#8b5cf6",
  EM_ROTA:"#6366f1",ENTREGUE:"#10b981",FINALIZADO:"#64748b",OCORRENCIA:"#ef4444",
};
const STATUS_LABELS: Record<string,string> = {
  PROGRAMADO:"Programado",EM_SEPARACAO:"Em Separação",CARREGADO:"Carregado",
  EM_ROTA:"Em Rota",ENTREGUE:"Entregue",FINALIZADO:"Finalizado",OCORRENCIA:"Ocorrência",
};

const TOOLTIP_STYLE = {
  contentStyle: { background:"#162030", border:"1px solid #273d58", borderRadius:8, color:"#f1f5f9", fontSize:12 },
  cursor: { fill:"rgba(249,115,22,0.05)" },
};

export default function RelatoriosPage() {
  const now = new Date();
  const [tab, setTab] = useState<"mensal"|"anual"|"motoristas">("mensal");
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [motoristaDetail, setMotoristaDetail] = useState<{ open: boolean; nome: string; entregas: any[]; loading: boolean }>({ open: false, nome: "", entregas: [], loading: false });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tipo: tab, ano: String(ano), mes: String(mes) });
      const res = await fetch(`/api/relatorios?${params}`);
      if (!res.ok) {
        console.error("API Error:", res.status, res.statusText);
      }
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json.error) {
          console.error("API returned error:", json.error);
        }
        setData(json);
      } catch (err) {
        console.error("Failed to parse JSON:", text);
        setData({ error: "Failed to parse API response" });
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setData({ error: String(err) });
    } finally {
      setLoading(false);
    }
  }, [tab, ano, mes]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const anos = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  async function handleMotoristaClick(motoristaId: string, nome: string) {
    setMotoristaDetail({ open: true, nome, entregas: [], loading: true });
    try {
      const inicio = new Date(ano, mes - 1, 1).toISOString();
      const fim = new Date(ano, mes, 0, 23, 59, 59).toISOString();
      const res = await fetch(`/api/relatorios/motorista?motoristaId=${motoristaId}&inicio=${inicio}&fim=${fim}`);
      const entregas = await res.json();
      setMotoristaDetail({ open: true, nome, entregas, loading: false });
    } catch {
      setMotoristaDetail((prev) => ({ ...prev, loading: false }));
    }
  }

  return (
    <>
      <Topbar
        title="Relatórios"
        subtitle="Análise operacional e financeira"
        actions={
          <Button variant="ghost" size="sm">
            <Download size={14} /> Exportar
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-5">
        {/* Controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden w-full sm:w-auto" style={{ border:"1px solid var(--border)" }}>
            {(["mensal","anual","motoristas"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all capitalize"
                style={{
                  background: tab === t ? "var(--accent)" : "var(--surface)",
                  color: tab === t ? "white" : "var(--text2)",
                  borderRight: t !== "motoristas" ? "1px solid var(--border)" : "none",
                }}>
                {t === "mensal" ? "Mensal" : t === "anual" ? "Anual" : "Motoristas"}
              </button>
            ))}
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            {/* Year */}
            <select value={ano} onChange={(e) => setAno(Number(e.target.value))}
              className="flex-1 sm:flex-none px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)" }}>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>

            {/* Month (only for mensal/motoristas) */}
            {tab !== "anual" && (
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
                className="flex-1 sm:flex-none px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)" }}>
                {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            )}
          </div>
        </div>

        {loading ? <Loading /> : data?.error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-red-500 font-bold mb-2">Erro ao carregar os dados</div>
            <div className="text-sm" style={{ color: "var(--text3)" }}>{data.error}</div>
          </div>
        ) : (
          <>
            {/* ─── MENSAL ─────────────────────────────────────────────────── */}
            {tab === "mensal" && data && (
              <div className="space-y-5">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
                  {[
                    { label:"Entregas", value: data.entregas, icon:"📦", color:"#f97316", desc: "Total de entregas registradas no período" },
                    { label:"Notas Fiscais", value: data.notas, icon:"📄", color:"#3b82f6", desc: "Total de notas fiscais emitidas no período" },
                    { label:"Receita Frete", value: formatCurrency(data.financeiro?._sum?.valorFrete??0), icon:"💰", color:"#10b981", desc: "Soma total dos valores de frete cobrados" },
                    { label:"Custo Motorista", value: formatCurrency(data.financeiro?._sum?.custoMotorista??0), icon:"🚛", color:"#ef4444", desc: "Soma total dos custos pagos aos motoristas" },
                    { label:"Margem", value: `${formatCurrency(data.financeiro?.margem??0)} (${data.financeiro?.margemPercent??0}%)`, icon:"📊", color: (data.financeiro?.margem??0)>=0?"#10b981":"#ef4444", desc: "Lucro bruto: Receita Frete subtraída do Custo Motorista" },
                    { label:"Taxa Entrega", value: `${data.financeiro?.taxaEntrega??0}%`, icon:"✅", color: (data.financeiro?.taxaEntrega??0)>=80?"#10b981":(data.financeiro?.taxaEntrega??0)>=60?"#f59e0b":"#ef4444", desc: "Porcentagem de entregas com status Entregue ou Finalizado" },
                  ].map((k) => (
                    <Card key={k.label} className="relative overflow-hidden py-3 sm:py-4 px-3 sm:px-5" title={k.desc}>
                      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background:k.color }} />
                      <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest mb-1 sm:mb-2 truncate" style={{ color:"var(--text3)" }}>{k.label}</div>
                      <div className="font-head text-lg sm:text-2xl font-black truncate" title={String(k.value)} style={{ color:k.color }}>{k.value}</div>
                      <div className="absolute right-2 sm:right-3 top-2 sm:top-3 text-xl sm:text-2xl opacity-10">{k.icon}</div>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                  {/* Status chart */}
                  <Card>
                    <div className="font-head text-sm font-bold mb-4">Entregas por Status</div>
                    <div className="flex items-center gap-3 sm:gap-4">
                      <ResponsiveContainer width={140} height={140}>
                        <PieChart>
                          <Pie data={data.porStatus} dataKey="_count" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                            {data.porStatus?.map((s: any, i: number) => (
                              <Cell key={i} fill={STATUS_COLORS[s.status] || "#64748b"} />
                            ))}
                          </Pie>
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [v, "Entregas"]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {data.porStatus?.map((s: any) => (
                          <div key={s.status} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s.status]||"#64748b" }} />
                              <span className="text-xs" style={{ color:"var(--text2)" }}>{STATUS_LABELS[s.status]||s.status}</span>
                            </div>
                            <span className="font-mono text-xs font-bold">{s._count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>

                  {/* Top cidades */}
                  <Card>
                    <div className="font-head text-sm font-bold mb-4">Top 10 Cidades</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data.porCidade?.map((c: any) => ({ cidade: c.cidade, entregas: c._count }))}
                        layout="vertical" barSize={10}>
                        <XAxis type="number" tick={{ fontSize:10, fill:"var(--text3)" }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="cidade" tick={{ fontSize:10, fill:"var(--text2)" }} width={90} axisLine={false} tickLine={false} />
                        <Tooltip {...TOOLTIP_STYLE} />
                        <Bar dataKey="entregas" fill="var(--accent)" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>

                {/* Operacional */}
                <Card>
                  <div className="font-head text-sm font-bold mb-4">Resumo Operacional</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                    {[
                      { l:"Peso Total", v: formatWeight(data.financeiro?.pesoTotal??0), c:"#3b82f6" },
                      { l:"Volumes", v: String(data.financeiro?.volumeTotal??0), c:"#8b5cf6" },
                      { l:"Ticket Médio", v: formatCurrency(data.financeiro?._avg?.valorFrete??0), c:"#f97316", sub:"Receita média por entrega" },
                      { l:"Ticket Líquido", v: formatCurrency(data.entregas > 0 ? (data.financeiro?.margem ?? 0) / data.entregas : 0), c:"#10b981", sub:"Lucro médio por entrega" },
                    ].map((item) => (
                      <div key={item.l} className="text-center p-3 sm:p-4 rounded-xl" title={item.sub} style={{ background:"var(--surface2)" }}>
                        <div className="font-head text-base sm:text-xl font-black truncate" title={String(item.v)} style={{ color:item.c }}>{item.v}</div>
                        <div className="text-[9px] sm:text-[10px] font-mono mt-1 truncate" style={{ color:"var(--text3)" }}>{item.l.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Financeiro breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
                  <Card className="lg:col-span-2">
                    <div className="font-head text-sm font-bold mb-4">Resumo Financeiro do Mês</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                      {[
                        { l:"Frete Total", v: data.financeiro?._sum?.valorFrete??0, c:"#10b981", desc:"Soma total de todo o frete no período" },
                        { l:"Custo Motorista", v: data.financeiro?._sum?.custoMotorista??0, c:"#ef4444", desc:"Soma total de todos os custos com motoristas" },
                        { l:"Descarga", v: data.financeiro?._sum?.valorDescarga??0, c:"#3b82f6", desc:"Total gasto com taxas de descarga" },
                        { l:"Armazenagem", v: data.financeiro?._sum?.armazenagem??0, c:"#8b5cf6", desc:"Custos gerados com armazenagem de paletes" },
                        { l:"Adiantamentos", v: data.financeiro?._sum?.adiantamento??0, c:"#f59e0b", desc:"Total de adiantamentos pagos aos motoristas" },
                        { l:"Saldo Pendente", v: data.financeiro?._sum?.saldoPendente??0, c:((data.financeiro?._sum?.saldoPendente??0)>0)?"#ef4444":"#10b981", desc:"Total pendente para pagar aos motoristas" },
                      ].map((item) => (
                        <div key={item.l} className="text-center p-3 sm:p-4 rounded-xl" title={item.desc} style={{ background:"var(--surface2)" }}>
                          <div className="font-head text-sm sm:text-lg font-black truncate" title={formatCurrency(item.v)} style={{ color:item.c }}>{formatCurrency(item.v)}</div>
                          <div className="text-[9px] sm:text-[10px] font-mono mt-1 truncate" style={{ color:"var(--text3)" }}>{item.l.toUpperCase()}</div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card>
                    <div className="font-head text-sm font-bold mb-4 flex items-center justify-between">
                      <span>Maiores Descargas</span>
                      <DollarSign size={14} className="text-blue-500" />
                    </div>
                    <div className="space-y-3">
                      {data.detalheDescargas?.length > 0 ? (
                        data.detalheDescargas.map((d: any, i: number) => (
                          <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg" style={{ background: "var(--surface2)" }}>
                            <div className="min-w-0">
                              <div className="text-[10px] font-mono font-bold text-blue-600">{d.ref}</div>
                              <div className="text-[11px] font-semibold truncate" style={{ color: "var(--text)" }}>{d.info}</div>
                              <div className="text-[9px]" style={{ color: "var(--text3)" }}>{formatDate(d.data)}</div>
                            </div>
                            <div className="font-mono text-xs font-black text-blue-600">{formatCurrency(d.valor)}</div>
                          </div>
                        ))
                      ) : (
                        <div className="py-10 text-center text-xs italic" style={{ color: "var(--text3)" }}>Nenhuma descarga registrada</div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* ─── ANUAL ──────────────────────────────────────────────────── */}
            {tab === "anual" && data && (
              <div className="space-y-4 sm:space-y-5">
                {/* Totais */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  {[
                    { l:"Total Entregas", v: data.totalAnual?._count??0, c:"#f97316", suffix:"" },
                    { l:"Receita Anual", v: formatCurrency(data.totalAnual?._sum?.valorFrete??0), c:"#10b981", suffix:"" },
                    { l:"Peso Transportado", v: formatWeight(data.totalAnual?._sum?.pesoTotal??0), c:"#3b82f6", suffix:"" },
                  ].map((k) => (
                    <Card key={k.l} className="text-center py-4 sm:py-6">
                      <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest mb-1 sm:mb-2" style={{ color:"var(--text3)" }}>{k.l}</div>
                      <div className="font-head text-2xl sm:text-4xl font-black truncate" style={{ color:k.c }}>{k.v}</div>
                    </Card>
                  ))}
                </div>

                {/* Entregas por mês */}
                <Card>
                  <div className="font-head text-sm font-bold mb-4">Entregas por Mês — {ano}</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.dadosMensais?.map((d: any) => ({ ...d, mes: MESES[d.mes-1] }))}>
                      <XAxis dataKey="mes" tick={{ fontSize:11, fill:"var(--text3)", fontFamily:"IBM Plex Mono" }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="entregas" fill="var(--accent)" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* Receita mensal */}
                <Card>
                  <div className="font-head text-sm font-bold mb-4">Receita de Frete por Mês — {ano}</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.dadosMensais?.map((d: any) => ({ ...d, mes: MESES[d.mes-1] }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2d42" />
                      <XAxis dataKey="mes" tick={{ fontSize:11, fill:"var(--text3)", fontFamily:"IBM Plex Mono" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize:10, fill:"var(--text3)" }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [formatCurrency(v), "Receita"]} />
                      <Line type="monotone" dataKey="frete" stroke="#10b981" strokeWidth={2.5} dot={{ fill:"#10b981", r:4 }} activeDot={{ r:6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}

            {/* ─── MOTORISTAS ─────────────────────────────────────────────── */}
            {tab === "motoristas" && data && (
              <div className="space-y-4 sm:space-y-5">
                {/* Mobile card list */}
                <Card className="lg:hidden">
                  <div className="font-head text-sm font-bold mb-4">Ranking — {MESES[mes-1]}/{ano}</div>
                  {(!data.ranking || data.ranking.length === 0) ? (
                    <div className="py-8 text-center text-sm" style={{ color: "var(--text3)" }}>Nenhum dado</div>
                  ) : (
                    <div className="space-y-2">
                      {data.ranking.map((m: any, i: number) => {
                        const taxa = m.totalEntregas > 0 ? Math.round((m.entregues/m.totalEntregas)*100) : 0;
                        return (
                          <div key={m.id} onClick={() => handleMotoristaClick(m.id, m.nome)}
                            className="p-3 rounded-lg cursor-pointer transition-all hover:-translate-y-0.5"
                            style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="font-head font-black text-lg flex-shrink-0" style={{ color: i<3 ? ["#f59e0b","#94a3b8","#cd7c3a"][i] : "var(--text3)" }}>
                                  {i+1}
                                </span>
                                <span className="font-semibold text-sm truncate">{m.nome}</span>
                              </div>
                              <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono mb-2">
                              <div><span style={{ color:"var(--text3)" }}>Entregas</span><div className="text-sm font-bold" style={{ color:"var(--text)" }}>{m.totalEntregas}</div></div>
                              <div><span style={{ color:"var(--text3)" }}>Entregues</span><div className="text-sm font-bold" style={{ color:"#10b981" }}>{m.entregues}</div></div>
                              <div><span style={{ color:"var(--text3)" }}>Ocorr.</span><div className="text-sm font-bold" style={{ color: m.ocorrencias>0?"#ef4444":"var(--text3)" }}>{m.ocorrencias}</div></div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mb-2">
                              <div><span style={{ color:"var(--text3)" }}>Frete</span><div className="text-xs font-bold" style={{ color:"#10b981" }}>{formatCurrency(m.frete)}</div></div>
                              <div><span style={{ color:"var(--text3)" }}>Saldo</span><div className="text-xs font-bold" style={{ color: (m.saldo||0)>0?"#ef4444":"#10b981" }}>{formatCurrency(m.saldo)}</div></div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full" style={{ background:"var(--surface)" }}>
                                <div className="h-full rounded-full" style={{ width:`${taxa}%`, background: taxa>=90?"#10b981":taxa>=70?"#f59e0b":"#ef4444" }} />
                              </div>
                              <span className="text-[10px] font-mono w-8" style={{ color:"var(--text2)" }}>{taxa}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {/* Desktop table */}
                <Card className="hidden lg:block">
                  <div className="font-head text-sm font-bold mb-5">Ranking de Motoristas — {MESES[mes-1]}/{ano}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {["#","Motorista","Entregas","Rotas","Entregues","Ocorrências","Peso","Frete Cliente","Vlr Motorista","Descarga","Adiantamento","Saldo","Taxa"].map((h) => (
                            <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-normal font-mono"
                              style={{ color:"var(--text3)", borderBottom:"1px solid var(--border)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.ranking?.map((m: any, i: number) => {
                          const taxa = m.totalEntregas > 0 ? Math.round((m.entregues/m.totalEntregas)*100) : 0;
                          return (
                            <tr key={m.id} onClick={() => handleMotoristaClick(m.id, m.nome)} className="hover:bg-[#1e293b] transition-colors cursor-pointer" style={{ borderBottom:"1px solid var(--border)" }}>
                              <td className="px-3 py-3">
                                <span className="font-head font-black text-lg" style={{ color: i<3 ? ["#f59e0b","#94a3b8","#cd7c3a"][i] : "var(--text3)" }}>
                                  {i+1}
                                </span>
                              </td>
                              <td className="px-3 py-3 font-semibold text-sm">
                                <div className="flex items-center gap-2">
                                  {m.nome}
                                  <ChevronRight size={14} className="text-slate-500 opacity-0 group-hover:opacity-100" />
                                </div>
                              </td>
                              <td className="px-3 py-3 font-mono text-sm">{m.totalEntregas}</td>
                              <td className="px-3 py-3 font-mono text-sm" style={{ color:"#8b5cf6" }}>{m.rotas || 0}</td>
                              <td className="px-3 py-3 font-mono text-sm" style={{ color:"#10b981" }}>{m.entregues}</td>
                              <td className="px-3 py-3 font-mono text-sm" style={{ color: m.ocorrencias>0?"#ef4444":"var(--text3)" }}>{m.ocorrencias}</td>
                              <td className="px-3 py-3 font-mono text-xs" style={{ color:"var(--text2)" }}>{formatWeight(m.peso)}</td>
                              <td className="px-3 py-3 font-mono text-xs" style={{ color:"#10b981" }}>{formatCurrency(m.frete)}</td>
                              <td className="px-3 py-3 font-mono text-xs" style={{ color:"#3b82f6" }}>{formatCurrency(m.valorMotorista)}</td>
                              <td className="px-3 py-3 font-mono text-xs" style={{ color:"#8b5cf6" }}>{formatCurrency(m.descarga)}</td>
                              <td className="px-3 py-3 font-mono text-xs" style={{ color:"#f59e0b" }}>{formatCurrency(m.adiantamento)}</td>
                              <td className="px-3 py-3 font-mono text-xs font-bold" style={{ color: (m.saldo||0)>0?"#ef4444":"#10b981" }}>{formatCurrency(m.saldo)}</td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 rounded-full" style={{ background:"var(--surface2)" }}>
                                    <div className="h-full rounded-full" style={{ width:`${taxa}%`, background: taxa>=90?"#10b981":taxa>=70?"#f59e0b":"#ef4444" }} />
                                  </div>
                                  <span className="text-[10px] font-mono w-8" style={{ color:"var(--text2)" }}>{taxa}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {(!data.ranking || data.ranking.length === 0) && (
                          <tr><td colSpan={12} className="px-4 py-10 text-center text-sm" style={{ color:"var(--text3)" }}>
                            Nenhum dado para o período selecionado
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Comparativo bar */}
                {data.ranking?.length > 0 && (
                  <Card>
                    <div className="font-head text-sm font-bold mb-4">Comparativo de Entregas</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data.ranking.slice(0,8)} layout="vertical" barSize={12}>
                        <XAxis type="number" tick={{ fontSize:10, fill:"var(--text3)" }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="nome" tick={{ fontSize:11, fill:"var(--text2)" }} width={120} axisLine={false} tickLine={false} />
                        <Tooltip {...TOOLTIP_STYLE} />
                        <Bar dataKey="totalEntregas" name="Total" fill="#f97316" radius={[0,4,4,0]} />
                        <Bar dataKey="entregues" name="Entregues" fill="#10b981" radius={[0,4,4,0]} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:11 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Motorista Detail Modal */}
      {motoristaDetail.open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,.5)" }}>
          <div className="w-full sm:max-w-5xl max-h-[95vh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col animate-fadeIn" style={{ background: "var(--surface)" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(249,115,22,.1)" }}>
                  <Truck size={18} className="text-orange-500" />
                </div>
                <div>
                  <div className="font-bold text-sm" style={{ color: "var(--text)" }}>{motoristaDetail.nome}</div>
                  <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                    Entregas de {MESES[mes-1]}/{ano}
                  </div>
                </div>
              </div>
              <button onClick={() => setMotoristaDetail({ open: false, nome: "", entregas: [], loading: false })}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-3 sm:p-5">
              {motoristaDetail.loading ? (
                <div className="flex items-center justify-center py-16"><Loading /></div>
              ) : motoristaDetail.entregas.length === 0 ? (
                <div className="text-center py-16 text-sm" style={{ color: "var(--text3)" }}>Nenhuma entrega no período</div>
              ) : (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-4 sm:mb-5">
                    {(() => {
                      const items = motoristaDetail.entregas;
                      const totalFrete = items.reduce((s: number, x: any) => s + (x.valorFrete || 0), 0);
                      const totalMotorista = items.reduce((s: number, x: any) => s + (x.valorMotorista || 0), 0);
                      const totalDescarga = items.reduce((s: number, x: any) => s + (x.valorDescarga || 0), 0);
                      const totalAdiantamento = items.reduce((s: number, x: any) => s + (x.adiantamento || 0), 0);
                      const totalSaldo = items.reduce((s: number, x: any) => s + (x.saldoMotorista || 0), 0);
                      const diretas = items.filter((x: any) => x.tipo === "DIRETA").length;
                      const rotas = items.filter((x: any) => x.tipo === "ROTA").length;
                      return [
                        { l: `${diretas} Diretas / ${rotas} Rotas`, v: String(items.length), c: "#f97316" },
                        { l: "Frete Total", v: formatCurrency(totalFrete), c: "#10b981" },
                        { l: "Pago Motorista", v: formatCurrency(totalMotorista), c: "#3b82f6" },
                        { l: "Descargas", v: formatCurrency(totalDescarga), c: "#8b5cf6" },
                        { l: "Adiantamentos", v: formatCurrency(totalAdiantamento), c: "#f59e0b" },
                        { l: "Saldo Pendente", v: formatCurrency(totalSaldo), c: totalSaldo > 0 ? "#ef4444" : "#10b981" },
                      ].map((k) => (
                        <div key={k.l} className="text-center p-2 sm:p-3 rounded-xl" style={{ background: "var(--surface2)" }}>
                          <div className="font-head text-sm sm:text-lg font-black truncate" style={{ color: k.c }}>{k.v}</div>
                          <div className="text-[8px] sm:text-[9px] font-mono mt-0.5 uppercase truncate" style={{ color: "var(--text3)" }}>{k.l}</div>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {["Tipo", "Código", "Cliente / Rota", "Cidade", "Data", "Status", "Peso", "Frete", "Motorista", "Descarga", "Adiant.", "Saldo"].map((h) => (
                            <th key={h} className="text-left px-3 py-2.5 text-[9px] uppercase tracking-wider font-normal font-mono"
                              style={{ color: "var(--text3)", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {motoristaDetail.entregas.map((e: any) => (
                          <tr key={e.id} className="hover:bg-[#1e293b] transition-colors" style={{
                            borderBottom: "1px solid var(--border)",
                            background: e.tipo === "ROTA" ? "rgba(139,92,246,.04)" : undefined,
                          }}>
                            <td className="px-3 py-2.5">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                                background: e.tipo === "ROTA" ? "rgba(139,92,246,.1)" : "rgba(249,115,22,.1)",
                                color: e.tipo === "ROTA" ? "#8b5cf6" : "#f97316",
                              }}>{e.tipo === "ROTA" ? "Rota" : "Direta"}</span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{e.codigo}</td>
                            <td className="px-3 py-2.5 text-xs font-medium max-w-[180px] truncate">{e.razaoSocial}</td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text2)" }}>
                              {e.cidade ? <div className="flex items-center gap-1"><MapPin size={10} />{e.cidade}{e.uf ? ` - ${e.uf}` : ""}</div> : "—"}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--text2)" }}>
                              {e.dataAgendada ? formatDate(e.dataAgendada) : "—"}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                                background: STATUS_COLORS[e.status] ? `${STATUS_COLORS[e.status]}20` : "var(--surface2)",
                                color: STATUS_COLORS[e.status] || "var(--text3)",
                              }}>{STATUS_LABELS[e.status] || e.status}</span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--text2)" }}>{formatWeight(e.pesoTotal)}</td>
                            <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#10b981" }}>{formatCurrency(e.valorFrete)}</td>
                            <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#3b82f6" }}>{formatCurrency(e.valorMotorista || 0)}</td>
                            <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#8b5cf6" }}>{formatCurrency(e.valorDescarga || 0)}</td>
                            <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#f59e0b" }}>{formatCurrency(e.adiantamentoMotorista || 0)}</td>
                            <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: (e.saldoMotorista || 0) > 0 ? "#ef4444" : "#10b981" }}>
                              {formatCurrency(e.saldoMotorista || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                          <td colSpan={6} className="px-3 py-3 text-[10px] font-mono font-bold uppercase" style={{ color: "var(--text3)" }}>Totais</td>
                          <td className="px-3 py-3 font-mono text-xs font-bold">{formatWeight(motoristaDetail.entregas.reduce((s: number, x: any) => s + (x.pesoTotal || 0), 0))}</td>
                          <td className="px-3 py-3 font-mono text-xs font-bold" style={{ color: "#10b981" }}>{formatCurrency(motoristaDetail.entregas.reduce((s: number, x: any) => s + (x.valorFrete || 0), 0))}</td>
                          <td className="px-3 py-3 font-mono text-xs font-bold" style={{ color: "#3b82f6" }}>{formatCurrency(motoristaDetail.entregas.reduce((s: number, x: any) => s + (x.valorMotorista || 0), 0))}</td>
                          <td className="px-3 py-3 font-mono text-xs font-bold" style={{ color: "#8b5cf6" }}>{formatCurrency(motoristaDetail.entregas.reduce((s: number, x: any) => s + (x.valorDescarga || 0), 0))}</td>
                          <td className="px-3 py-3 font-mono text-xs font-bold" style={{ color: "#f59e0b" }}>{formatCurrency(motoristaDetail.entregas.reduce((s: number, x: any) => s + (x.adiantamentoMotorista || 0), 0))}</td>
                          <td className="px-3 py-3 font-mono text-xs font-bold" style={{ color: motoristaDetail.entregas.reduce((s: number, x: any) => s + (x.saldoMotorista || 0), 0) > 0 ? "#ef4444" : "#10b981" }}>
                            {formatCurrency(motoristaDetail.entregas.reduce((s: number, x: any) => s + (x.saldoMotorista || 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
