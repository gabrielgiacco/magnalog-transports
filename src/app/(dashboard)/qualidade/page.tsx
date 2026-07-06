"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card, Loading, KpiCard, Select, Table, Th, Td, Tr, StatusBadge } from "@/components/ui";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Package,
  Route,
  Calendar,
  Award,
  BarChart3
} from "lucide-react";
import toast from "react-hot-toast";
import { QUALIDADE_ENABLED } from "@/lib/features";

export default function QualityDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!QUALIDADE_ENABLED) {
      router.replace("/dashboard");
      return;
    }
    async function fetchData() {
      setLoading(true);
      try {
        const [resResumo, resHistory] = await Promise.all([
          fetch(`/api/qualidade/resumo?month=${month}`),
          fetch(`/api/qualidade`)
        ]);

        if (resResumo.ok) setData(await resResumo.json());
        if (resHistory.ok) setHistory(await resHistory.json());
      } catch (e) {
        toast.error("Erro ao carregar dados de qualidade");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [month, router]);

  if (!QUALIDADE_ENABLED) {
    return <><Topbar title="Qualidade Operacional" /><Loading /></>;
  }

  if (loading && !data) return <><Topbar title="Qualidade Operacional" /><Loading /></>;

  const classification = data?.classificacao || { excelente: 0, bom: 0, critico: 0 };
  const avgPerc = data?.averagePerc || 0;

  return (
    <>
      <Topbar 
        title="Controle de Qualidade Operacional" 
        subtitle="Indicadores de performance e bonificação da equipe"
        actions={
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
            <input 
              type="month" 
              value={month} 
              onChange={(e) => setMonth(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard 
            label="Score Médio Mensal" 
            value={`${data?.averageScore?.toFixed(1) || 0} / 40`}
            sub={`${avgPerc.toFixed(1)}% de aproveitamento`}
            icon="🏆"
            color={avgPerc >= 90 ? "#22c55e" : avgPerc >= 80 ? "#eab308" : "#ef4444"}
          />
          <KpiCard 
            label="Total Avaliações" 
            value={data?.totalEvaluated || 0}
            sub={`${data?.totalEntregas || 0} entregas · ${data?.totalRotas || 0} rotas`}
            icon="📋"
            color="#3b82f6"
          />
          <KpiCard 
            label="Nível Excelente" 
            value={classification.excelente}
            sub="Aptos para bonificação máxima"
            icon="⭐"
            color="#22c55e"
          />
          <KpiCard 
            label="Nível Crítico" 
            value={classification.critico}
            sub="Necessitam reciclagem"
            icon="⚠️"
            color="#ef4444"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Detailed Breakdown */}
          <Card className="col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-accent" />
                <h3 className="font-bold">Detalhamento por Critério</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400 uppercase">Percentual de Conformidade</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 p-4">
              <ProgressBar label="Conferência Correta" value={data?.percConferencia || 0} icon="🔍" />
              <ProgressBar label="Carregamento Adequado" value={data?.percCarregamento || 0} icon="📦" />
              <ProgressBar label="Ausência de Avarias" value={100 - (data?.percAvaria || 0)} icon="🛡️" color="#10b981" />
              <ProgressBar label="Organização Geral" value={data?.percOrganizacao || 0} icon="🏢" />
            </div>

            <div className="mt-8 p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-4">
               <Award size={32} className="text-orange-400" />
               <div className="flex-1">
                  <h4 className="text-sm font-bold">Resumo de Bonificação</h4>
                  <p className="text-xs text-slate-500">A equipe atingiu <strong>{avgPerc.toFixed(1)}%</strong> da meta de qualidade este mês.</p>
               </div>
               <div className="text-right">
                  <StatusBadge status={avgPerc >= 90 ? "SUCCESS" : avgPerc >= 80 ? "PROGRAMADO" : "CANCELADA"} />
               </div>
            </div>
          </Card>

          {/* Classification Distribution */}
          <Card>
            <h3 className="font-bold mb-6 flex items-center gap-2">
              <TrendingUp size={18} className="text-accent" />
              Distribuição
            </h3>
            <div className="space-y-4">
               <DistributionItem label="Excelente (90-100%)" count={classification.excelente} total={data?.totalEvaluated} color="#22c55e" />
               <DistributionItem label="Bom (80-89%)" count={classification.bom} total={data?.totalEvaluated} color="#eab308" />
               <DistributionItem label="Crítico (< 80%)" count={classification.critico} total={data?.totalEvaluated} color="#ef4444" />
            </div>

            <div className="mt-10 pt-6 border-t border-slate-100 text-center">
               <p className="text-[10px] font-mono text-slate-400 uppercase mb-2">Meta Operacional</p>
               <div className="text-2xl font-black text-slate-300">85.0%</div>
               <div className="mt-2 text-xs font-bold" style={{ color: avgPerc >= 85 ? "#22c55e" : "#ef4444" }}>
                 {avgPerc >= 85 ? "✓ Meta Atingida" : "× Abaixo da Meta"}
               </div>
            </div>
          </Card>
        </div>

        {/* History Table */}
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm">Últimas Avaliações</h3>
            <span className="text-[10px] font-mono text-slate-400">TOTAL: {history.length}</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Tipo</Th>
                  <Th>Referência</Th>
                  <Th>Score</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((h: any) => (
                  <Tr key={h.id}>
                    <Td><span className="text-xs font-mono">{formatDate(h.createdAt)}</span></Td>
                    <Td>
                      {h.entregaId ? (
                        <div className="flex items-center gap-1.5 text-blue-500">
                          <Package size={12} /> <span className="text-[10px] font-bold uppercase">Entrega</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-orange-500">
                          <Route size={12} /> <span className="text-[10px] font-bold uppercase">Rota</span>
                        </div>
                      )}
                    </Td>
                    <Td>
                      <span className="font-bold text-xs">
                        {h.entrega?.codigo || h.rota?.codigo || "—"}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono font-bold" style={{ color: h.pontuacao >= 36 ? "#22c55e" : h.pontuacao >= 32 ? "#eab308" : "#ef4444" }}>
                        {h.pontuacao} pts
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: h.pontuacao >= 36 ? "#22c55e" : h.pontuacao >= 32 ? "#eab308" : "#ef4444" }} />
                        <span className="text-[10px] font-bold uppercase">
                          {h.pontuacao >= 36 ? "Excelente" : h.pontuacao >= 32 ? "Bom" : "Crítico"}
                        </span>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {history.length === 0 && (
              <div className="py-20 text-center text-slate-400">
                <ShieldCheck size={40} className="mx-auto mb-4 opacity-10" />
                <p className="text-sm">Nenhuma avaliação registrada ainda.</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function ProgressBar({ label, value, icon, color = "var(--accent)" }: any) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-2 font-bold text-slate-600">
           <span className="text-lg">{icon}</span>
           {label}
        </div>
        <span className="font-mono font-bold" style={{ color }}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-1000" 
          style={{ width: `${value}%`, background: color }} 
        />
      </div>
    </div>
  );
}

function DistributionItem({ label, count, total, color }: any) {
  const perc = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px] font-bold">
        <span className="text-slate-500">{label}</span>
        <span style={{ color }}>{count} ({perc.toFixed(0)}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-50 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${perc}%`, background: color }} />
      </div>
    </div>
  );
}
