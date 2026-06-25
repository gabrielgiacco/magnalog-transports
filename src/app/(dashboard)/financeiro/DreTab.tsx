"use client";
import { useEffect, useState } from "react";
import { Card, Loading, Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ChevronDown, ChevronRight, Printer, TrendingUp, TrendingDown } from "lucide-react";

interface Categoria {
  categoriaId: string | null;
  nome: string;
  total: number;
  subcategorias: { id: string | null; nome: string; total: number }[];
}

interface DreData {
  mes: number;
  ano: number;
  atual: {
    receitas: Categoria[];
    despesas: Categoria[];
    totalReceitas: number;
    totalDespesas: number;
    resultado: number;
  };
  anterior: {
    totalReceitas: number;
    totalDespesas: number;
    resultado: number;
  };
  historico: { mes: string; receitas: number; despesas: number; resultado: number }[];
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function DreTab() {
  const [data, setData] = useState<DreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/financeiro/dre?mes=${mes}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [mes]);

  function toggle(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  }

  function varPercent(atual: number, anterior: number) {
    if (anterior === 0) return atual === 0 ? 0 : 100;
    return ((atual - anterior) / Math.abs(anterior)) * 100;
  }

  function corVariacao(v: number, inverter = false): string {
    const positivo = inverter ? v < 0 : v > 0;
    return positivo ? "#059669" : v === 0 ? "var(--text3)" : "#dc2626";
  }

  if (loading) return <Loading />;
  if (!data) return <Card>Erro ao carregar DRE</Card>;

  const varReceita = varPercent(data.atual.totalReceitas, data.anterior.totalReceitas);
  const varDespesa = varPercent(data.atual.totalDespesas, data.anterior.totalDespesas);
  const varResultado = varPercent(data.atual.resultado, data.anterior.resultado);

  return (
    <div className="space-y-4 dre-container">
      {/* Header (controles) */}
      <Card className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Mês</label>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface2)" }}
          />
        </div>
        <Button size="sm" variant="ghost" onClick={() => window.print()}>
          <Printer size={14} /> Imprimir DRE
        </Button>
      </Card>

      {/* Header (impressão) */}
      <div className="hidden print:block text-center mb-4">
        <h1 className="text-2xl font-bold">Demonstrativo de Resultado do Exercício</h1>
        <div className="text-sm">Magna Log Transportes · {MESES[data.mes - 1]} / {data.ano}</div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Receitas</div>
          <div className="text-xl font-head font-bold font-mono mt-1" style={{ color: "#059669" }}>{formatCurrency(data.atual.totalReceitas)}</div>
          <div className="text-[10px] mt-1" style={{ color: corVariacao(varReceita) }}>
            {varReceita >= 0 ? "↑" : "↓"} {Math.abs(varReceita).toFixed(1)}% vs mês anterior
          </div>
        </Card>
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Despesas</div>
          <div className="text-xl font-head font-bold font-mono mt-1" style={{ color: "#dc2626" }}>{formatCurrency(data.atual.totalDespesas)}</div>
          <div className="text-[10px] mt-1" style={{ color: corVariacao(varDespesa, true) }}>
            {varDespesa >= 0 ? "↑" : "↓"} {Math.abs(varDespesa).toFixed(1)}% vs mês anterior
          </div>
        </Card>
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Resultado</div>
          <div className="text-xl font-head font-bold font-mono mt-1" style={{ color: data.atual.resultado >= 0 ? "#059669" : "#dc2626" }}>{formatCurrency(data.atual.resultado)}</div>
          <div className="text-[10px] mt-1" style={{ color: corVariacao(varResultado) }}>
            {varResultado >= 0 ? "↑" : "↓"} {Math.abs(varResultado).toFixed(1)}% vs mês anterior
          </div>
        </Card>
      </div>

      {/* DRE Tabela */}
      <Card className="p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ background: "var(--surface2)" }}>
              <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Descrição</th>
              <th className="text-right px-4 py-2 text-xs font-bold uppercase tracking-wider w-40" style={{ color: "var(--text2)" }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: "rgba(5,150,105,.05)" }}>
              <td className="px-4 py-2 text-sm font-bold" style={{ color: "#059669" }}>(+) RECEITAS</td>
              <td className="text-right px-4 py-2 text-sm font-mono font-bold" style={{ color: "#059669" }}>{formatCurrency(data.atual.totalReceitas)}</td>
            </tr>
            {data.atual.receitas.map((c) => (
              <CategoriaRow key={c.categoriaId || c.nome} cat={c} expanded={expanded} toggle={toggle} color="#059669" />
            ))}
            {data.atual.receitas.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-2 text-xs italic text-center" style={{ color: "var(--text3)" }}>Sem receitas registradas no mês</td></tr>
            )}

            <tr style={{ background: "rgba(239,68,68,.05)" }}>
              <td className="px-4 py-2 text-sm font-bold" style={{ color: "#dc2626" }}>(−) DESPESAS</td>
              <td className="text-right px-4 py-2 text-sm font-mono font-bold" style={{ color: "#dc2626" }}>{formatCurrency(data.atual.totalDespesas)}</td>
            </tr>
            {data.atual.despesas.map((c) => (
              <CategoriaRow key={c.categoriaId || c.nome} cat={c} expanded={expanded} toggle={toggle} color="#dc2626" />
            ))}
            {data.atual.despesas.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-2 text-xs italic text-center" style={{ color: "var(--text3)" }}>Sem despesas registradas no mês</td></tr>
            )}

            <tr style={{ background: data.atual.resultado >= 0 ? "rgba(59,130,246,.08)" : "rgba(239,68,68,.08)", borderTop: "2px solid var(--border)" }}>
              <td className="px-4 py-3 text-sm font-bold uppercase">RESULTADO LÍQUIDO</td>
              <td className="text-right px-4 py-3 text-base font-mono font-bold" style={{ color: data.atual.resultado >= 0 ? "#2563eb" : "#dc2626" }}>
                {formatCurrency(data.atual.resultado)}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* Histórico 12 meses */}
      <Card className="print:hidden">
        <h3 className="font-bold text-sm mb-3">Histórico últimos 12 meses</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.historico}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()} />
            <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="receitas" fill="#059669" name="Receitas" />
            <Bar dataKey="despesas" fill="#dc2626" name="Despesas" />
            <Bar dataKey="resultado" fill="#2563eb" name="Resultado" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function CategoriaRow({ cat, expanded, toggle, color }: { cat: Categoria; expanded: Set<string>; toggle: (k: string) => void; color: string }) {
  const key = cat.categoriaId || cat.nome;
  const isOpen = expanded.has(key);
  const temSubs = cat.subcategorias.length > 0;

  return (
    <>
      <tr className="hover:bg-gray-50" style={{ borderBottom: "1px solid var(--border)" }}>
        <td className="px-4 py-2 text-sm">
          <button className="flex items-center gap-2" onClick={() => temSubs && toggle(key)} disabled={!temSubs}>
            {temSubs ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
            <span className="ml-4">{cat.nome}</span>
          </button>
        </td>
        <td className="text-right px-4 py-2 text-sm font-mono" style={{ color }}>{formatCurrency(cat.total)}</td>
      </tr>
      {isOpen && cat.subcategorias.map((s) => (
        <tr key={s.id || s.nome} className="hover:bg-gray-50" style={{ borderBottom: "1px solid var(--border)" }}>
          <td className="px-4 py-1.5 text-xs pl-12" style={{ color: "var(--text2)" }}>· {s.nome}</td>
          <td className="text-right px-4 py-1.5 text-xs font-mono" style={{ color }}>{formatCurrency(s.total)}</td>
        </tr>
      ))}
    </>
  );
}
