"use client";
import { useEffect, useState } from "react";
import { Card, Loading } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Wallet, AlertCircle, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface PainelData {
  saldoCaixa: number;
  receitasMes: number;
  despesasMes: number;
  resultadoMes: number;
  aReceber30d: number;
  aPagar30d: number;
  vencidoReceber: number;
  vencidoPagar: number;
  topRecebimentos: { id: string; descricao: string; valor: number; diasParaVencer: number; cliente?: string }[];
  topPagamentos: { id: string; descricao: string; valor: number; diasParaVencer: number; favorecido?: string }[];
  alertas: { tipo: "warning" | "danger" | "info"; mensagem: string }[];
}

export function PainelTab() {
  const [data, setData] = useState<PainelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/financeiro/painel")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (!data) return <Card>Erro ao carregar painel financeiro.</Card>;

  const resultadoPositivo = data.resultadoMes >= 0;

  return (
    <div className="space-y-4">
      {/* KPIs principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Saldo do Caixa"
          value={data.saldoCaixa}
          icon={Wallet}
          color={data.saldoCaixa >= 0 ? "blue" : "red"}
          hint="Soma de todas as receitas pagas - despesas pagas"
        />
        <KpiCard
          label="A Receber em 30 dias"
          value={data.aReceber30d}
          icon={ArrowUpRight}
          color="green"
          subValue={data.vencidoReceber > 0 ? `${formatCurrency(data.vencidoReceber)} vencido` : undefined}
          subValueColor="red"
        />
        <KpiCard
          label="A Pagar em 30 dias"
          value={data.aPagar30d}
          icon={ArrowDownRight}
          color="orange"
          subValue={data.vencidoPagar > 0 ? `${formatCurrency(data.vencidoPagar)} vencido` : undefined}
          subValueColor="red"
        />
        <KpiCard
          label="Resultado do Mês"
          value={data.resultadoMes}
          icon={resultadoPositivo ? TrendingUp : TrendingDown}
          color={resultadoPositivo ? "green" : "red"}
          hint={`Receitas: ${formatCurrency(data.receitasMes)} · Despesas: ${formatCurrency(data.despesasMes)}`}
        />
      </div>

      {/* Alertas */}
      {data.alertas.length > 0 && (
        <Card className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Alertas</div>
          {data.alertas.map((alerta, i) => (
            <div
              key={i}
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{
                background: alerta.tipo === "danger" ? "rgba(239,68,68,.08)" : alerta.tipo === "warning" ? "rgba(245,158,11,.08)" : "rgba(59,130,246,.08)",
                color: alerta.tipo === "danger" ? "#dc2626" : alerta.tipo === "warning" ? "#d97706" : "#2563eb",
              }}
            >
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{alerta.mensagem}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Top recebimentos e pagamentos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-head font-bold text-sm">Próximos Recebimentos</h3>
            <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>top 5 maiores</span>
          </div>
          {data.topRecebimentos.length === 0 ? (
            <div className="text-sm py-6 text-center" style={{ color: "var(--text3)" }}>Sem recebimentos pendentes</div>
          ) : (
            <div className="space-y-2">
              {data.topRecebimentos.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "var(--surface2)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.descricao}</div>
                    {r.cliente && <div className="text-[10px] truncate" style={{ color: "var(--text3)" }}>{r.cliente}</div>}
                  </div>
                  <div className="text-right ml-3">
                    <div className="text-sm font-bold font-mono" style={{ color: "#059669" }}>{formatCurrency(r.valor)}</div>
                    <div className="text-[10px]" style={{ color: r.diasParaVencer < 0 ? "#dc2626" : "var(--text3)" }}>
                      {r.diasParaVencer < 0 ? `${Math.abs(r.diasParaVencer)}d vencido` : r.diasParaVencer === 0 ? "hoje" : `em ${r.diasParaVencer}d`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-head font-bold text-sm">Próximos Pagamentos</h3>
            <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>top 5 maiores</span>
          </div>
          {data.topPagamentos.length === 0 ? (
            <div className="text-sm py-6 text-center" style={{ color: "var(--text3)" }}>Sem pagamentos pendentes</div>
          ) : (
            <div className="space-y-2">
              {data.topPagamentos.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "var(--surface2)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.descricao}</div>
                    {p.favorecido && <div className="text-[10px] truncate" style={{ color: "var(--text3)" }}>{p.favorecido}</div>}
                  </div>
                  <div className="text-right ml-3">
                    <div className="text-sm font-bold font-mono" style={{ color: "#dc2626" }}>{formatCurrency(p.valor)}</div>
                    <div className="text-[10px]" style={{ color: p.diasParaVencer < 0 ? "#dc2626" : "var(--text3)" }}>
                      {p.diasParaVencer < 0 ? `${Math.abs(p.diasParaVencer)}d vencido` : p.diasParaVencer === 0 ? "hoje" : `em ${p.diasParaVencer}d`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  hint,
  subValue,
  subValueColor,
}: {
  label: string;
  value: number;
  icon: any;
  color: "blue" | "green" | "red" | "orange";
  hint?: string;
  subValue?: string;
  subValueColor?: "red" | "green";
}) {
  const colorMap = {
    blue: { bg: "rgba(59,130,246,.1)", fg: "#2563eb" },
    green: { bg: "rgba(5,150,105,.1)", fg: "#059669" },
    red: { bg: "rgba(239,68,68,.1)", fg: "#dc2626" },
    orange: { bg: "rgba(249,115,22,.1)", fg: "#ea580c" },
  };
  const c = colorMap[color];
  return (
    <Card>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
          <Icon size={16} style={{ color: c.fg }} />
        </div>
      </div>
      <div className="text-2xl font-head font-bold font-mono" style={{ color: c.fg }}>{formatCurrency(value)}</div>
      {subValue && (
        <div className="text-[10px] font-mono mt-1" style={{ color: subValueColor === "red" ? "#dc2626" : "#059669" }}>{subValue}</div>
      )}
      {hint && !subValue && (
        <div className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>{hint}</div>
      )}
    </Card>
  );
}
