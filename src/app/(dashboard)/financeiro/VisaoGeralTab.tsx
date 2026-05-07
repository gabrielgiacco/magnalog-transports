"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, Loading, Empty, Table, Th, Td, Tr } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, Wallet } from "lucide-react";

export function VisaoGeralTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/financeiro/dashboard");
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="p-6"><Loading /></div>;
  if (!data) return <div className="p-6"><Empty text="Erro ao carregar dashboard" /></div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      
      {/* Cards KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
            <TrendingUp size={24} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase">Receitas Previstas</div>
            <div className="text-xl font-black text-emerald-500">{formatCurrency(data.totalReceitas)}</div>
            <div className="text-[10px] text-slate-500 mt-1">Realizado: {formatCurrency(data.receitasPagas)}</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-rose-500/10 border border-rose-500/20 text-rose-500">
            <TrendingDown size={24} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase">Despesas Previstas</div>
            <div className="text-xl font-black text-rose-500">{formatCurrency(data.totalDespesas)}</div>
            <div className="text-[10px] text-slate-500 mt-1">Realizado: {formatCurrency(data.despesasPagas)}</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-500">
            <DollarSign size={24} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase">Saldo Previsto</div>
            <div className={`text-xl font-black ${data.saldoPrevisto >= 0 ? "text-blue-500" : "text-rose-500"}`}>
              {formatCurrency(data.saldoPrevisto)}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-500/10 border border-orange-500/20 text-orange-500">
            <Wallet size={24} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase">Saldo Realizado (Caixa)</div>
            <div className={`text-xl font-black ${data.saldoRealizado >= 0 ? "text-orange-500" : "text-rose-500"}`}>
              {formatCurrency(data.saldoRealizado)}
            </div>
          </div>
        </Card>
      </div>

      {/* Despesas por Categoria */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-200">Despesas por Categoria (Mês Atual)</h3>
        </div>
        <Table>
          <thead className="bg-slate-800/50">
            <tr>
              <Th>Categoria</Th>
              <Th className="text-right">Total Gasto</Th>
            </tr>
          </thead>
          <tbody>
            {data.despesasPorCategoria.length === 0 ? (
              <Tr><Td colSpan={2} className="text-center text-slate-500">Nenhuma despesa registrada no mês</Td></Tr>
            ) : (
              data.despesasPorCategoria.map((cat: any) => (
                <Tr key={cat.name}>
                  <Td className="font-medium text-slate-300">{cat.name}</Td>
                  <Td className="text-right text-rose-500 font-mono font-bold">{formatCurrency(cat.value)}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

    </div>
  );
}
