"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Loading, Button } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";
import { TrendingDown, TrendingUp, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

interface DiaFluxo {
  data: string;
  entradas: number;
  saidas: number;
  saldo: number;
  itens: { id: string; tipo: string; descricao: string; valor: number; parte: string | null; fluxo: "entrada" | "saida" }[];
}

interface FluxoData {
  saldoInicial: number;
  saldoFinal: number;
  totalEntradas: number;
  totalSaidas: number;
  piorSaldo: { valor: number; data: string };
  diasNegativos: number;
  dias: DiaFluxo[];
}

export function FluxoCaixaTab() {
  const [data, setData] = useState<FluxoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<30 | 60 | 90>(30);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/financeiro/fluxo-caixa?ate=${periodo}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [periodo]);

  function toggle(d: string) {
    const next = new Set(expanded);
    if (next.has(d)) next.delete(d); else next.add(d);
    setExpanded(next);
  }

  const grafico = useMemo(() => {
    if (!data) return [];
    return data.dias.map((d) => ({
      data: d.data.slice(5), // MM-DD
      saldo: d.saldo,
    }));
  }, [data]);

  if (loading) return <Loading />;
  if (!data) return <Card>Erro ao carregar fluxo de caixa</Card>;

  return (
    <div className="space-y-4">
      {/* Período selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Projeção:</span>
        {[30, 60, 90].map((p) => (
          <Button
            key={p}
            size="sm"
            variant={periodo === p ? "primary" : "ghost"}
            onClick={() => setPeriodo(p as 30 | 60 | 90)}
          >
            {p} dias
          </Button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Saldo Hoje</div>
          <div className="text-xl font-head font-bold font-mono mt-1" style={{ color: data.saldoInicial >= 0 ? "#2563eb" : "#dc2626" }}>
            {formatCurrency(data.saldoInicial)}
          </div>
        </Card>
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>
            Saldo em {periodo}d
          </div>
          <div className="text-xl font-head font-bold font-mono mt-1" style={{ color: data.saldoFinal >= 0 ? "#059669" : "#dc2626" }}>
            {formatCurrency(data.saldoFinal)}
          </div>
        </Card>
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Pior Saldo no Período</div>
          <div className="text-xl font-head font-bold font-mono mt-1" style={{ color: data.piorSaldo.valor >= 0 ? "var(--text)" : "#dc2626" }}>
            {formatCurrency(data.piorSaldo.valor)}
          </div>
          {data.piorSaldo.data && (
            <div className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>em {formatDate(data.piorSaldo.data)}</div>
          )}
        </Card>
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Dias Negativos</div>
          <div className="text-xl font-head font-bold font-mono mt-1" style={{ color: data.diasNegativos > 0 ? "#dc2626" : "#059669" }}>
            {data.diasNegativos}
          </div>
          <div className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>de {periodo} dias</div>
        </Card>
      </div>

      {data.diasNegativos > 0 && (
        <Card className="flex items-start gap-3" style={{ background: "rgba(239,68,68,.08)", borderColor: "rgba(239,68,68,.3)" }}>
          <AlertTriangle size={18} style={{ color: "#dc2626", flexShrink: 0, marginTop: 2 }} />
          <div>
            <div className="font-bold text-sm" style={{ color: "#dc2626" }}>Atenção: saldo projetado fica negativo em {data.diasNegativos} dia{data.diasNegativos > 1 ? "s" : ""}</div>
            <div className="text-xs" style={{ color: "var(--text2)" }}>
              Considere adiar pagamentos não críticos ou acelerar recebimentos pendentes para evitar saldo negativo.
            </div>
          </div>
        </Card>
      )}

      {/* Gráfico de saldo */}
      <Card>
        <h3 className="font-bold text-sm mb-3">Saldo acumulado projetado</h3>
        <ResponsiveContainer width="100%" height={280}>
          <RechartsLineChart data={grafico}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="data" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()} />
            <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
            <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="saldo" stroke="#2563eb" strokeWidth={2} dot={false} />
          </RechartsLineChart>
        </ResponsiveContainer>
      </Card>

      {/* Tabela diária */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
          <h3 className="font-bold text-sm">Detalhe diário</h3>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {data.dias.filter((d) => d.entradas > 0 || d.saidas > 0).map((d) => {
            const isOpen = expanded.has(d.data);
            return (
              <div key={d.data} className="border-b" style={{ borderColor: "var(--border)" }}>
                <button className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-50" onClick={() => toggle(d.data)}>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="w-24 text-xs font-mono font-bold">{formatDate(d.data)}</span>
                  {d.entradas > 0 && (
                    <span className="flex items-center gap-1 text-xs font-mono" style={{ color: "#059669" }}>
                      <TrendingUp size={12} /> +{formatCurrency(d.entradas)}
                    </span>
                  )}
                  {d.saidas > 0 && (
                    <span className="flex items-center gap-1 text-xs font-mono" style={{ color: "#dc2626" }}>
                      <TrendingDown size={12} /> -{formatCurrency(d.saidas)}
                    </span>
                  )}
                  <span className="flex-1"></span>
                  <span className="text-xs font-mono font-bold" style={{ color: d.saldo >= 0 ? "#2563eb" : "#dc2626" }}>
                    saldo: {formatCurrency(d.saldo)}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-12 py-2 space-y-1 bg-gray-50">
                    {d.itens.map((i) => (
                      <div key={i.id} className="flex items-center gap-2 text-xs">
                        <span style={{ color: i.fluxo === "entrada" ? "#059669" : "#dc2626" }}>{i.fluxo === "entrada" ? "+" : "-"}</span>
                        <span className="font-medium">{i.descricao}</span>
                        {i.parte && <span style={{ color: "var(--text3)" }}>· {i.parte}</span>}
                        <span className="flex-1"></span>
                        <span className="font-mono font-bold" style={{ color: i.fluxo === "entrada" ? "#059669" : "#dc2626" }}>
                          {formatCurrency(i.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {data.dias.every((d) => d.entradas === 0 && d.saidas === 0) && (
            <div className="text-center py-8 text-sm" style={{ color: "var(--text3)" }}>
              Sem movimentações previstas nos próximos {periodo} dias
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
