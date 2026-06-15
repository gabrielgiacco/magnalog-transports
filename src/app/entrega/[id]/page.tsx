"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDate } from "@/lib/utils";

const STATUS_STEPS = [
  { key: "PROGRAMADO",   label: "Programado",    icon: "📋", desc: "Entrega programada no sistema" },
  { key: "EM_SEPARACAO", label: "Em Separação",  icon: "📦", desc: "Mercadoria sendo separada" },
  { key: "CARREGADO",    label: "Carregado",     icon: "🔄", desc: "Carregado no veículo" },
  { key: "EM_ROTA",      label: "Em Rota",       icon: "🚛", desc: "Motorista a caminho" },
  { key: "ENTREGUE",     label: "Entregue",      icon: "✅", desc: "Entrega realizada com sucesso" },
];

const STATUS_COLORS: Record<string, string> = {
  PROGRAMADO: "#f59e0b", EM_SEPARACAO: "#3b82f6", CARREGADO: "#8b5cf6",
  EM_ROTA: "#6366f1", ENTREGUE: "#10b981", FINALIZADO: "#10b981", OCORRENCIA: "#ef4444",
};

export default function EntregaTrackingPage() {
  const params = useParams()!; const id = params!.id as string;
  const [entrega, setEntrega] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/tracking/${id}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setEntrega(d); })
      .catch(() => setError("Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [id]);

  const fmtDate = (d: any) => formatDate(d);

  const currentIdx = STATUS_STEPS.findIndex(s => s.key === entrega?.status);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
          style={{ borderColor: "var(--border2)", borderTopColor: "var(--accent)" }} />
        <p className="text-sm" style={{ color: "var(--text2)" }}>Consultando entrega...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: "var(--bg)" }}>
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <img src="/logo.png" alt="MAGNALOG" className="h-10 w-auto object-contain mx-auto mb-3" />
          <div className="text-xs font-mono tracking-widest uppercase" style={{ color: "var(--text3)" }}>
            Rastreamento de Entrega
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-4xl mb-4">🔍</div>
            <h2 className="font-head text-xl font-bold mb-2">Entrega não encontrada</h2>
            <p className="text-sm" style={{ color: "var(--text2)" }}>{error}</p>
          </div>
        ) : entrega && (
          <>
            {/* Entrega info */}
            <div className="rounded-2xl p-6 mb-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="font-mono text-sm mb-1" style={{ color: "var(--accent)" }}>
                    {entrega.notas && entrega.notas.length > 0 ? `NF ${entrega.notas.map((n: any) => n.numero).join(", ")}` : entrega.codigo}
                  </div>
                  <div className="font-head text-xl font-bold">{entrega.razaoSocial}</div>
                  <div className="text-sm mt-0.5" style={{ color: "var(--text2)" }}>
                    📍 {entrega.cidade}{entrega.uf ? `, ${entrega.uf}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`badge badge-${entrega.status}`}>
                    {STATUS_STEPS.find(s => s.key === entrega.status)?.label || entrega.status}
                  </span>
                  {entrega.status === "OCORRENCIA" && (
                    <div className="mt-2 text-xs px-3 py-1.5 rounded-xl"
                      style={{ background: "rgba(239,68,68,.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)" }}>
                      ⚠ Ocorrência registrada
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { l: "Data Agendada", v: fmtDate(entrega.dataAgendada) },
                  { l: "NFs", v: entrega._count?.notas ?? entrega.notas?.length ?? 0 },
                  { l: "Data Entrega", v: fmtDate(entrega.dataEntrega) },
                ].map(item => (
                  <div key={item.l} className="rounded-xl p-3 text-center" style={{ background: "var(--surface2)" }}>
                    <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "var(--text3)" }}>{item.l}</div>
                    <div className="font-mono text-sm font-semibold">{item.v}</div>
                  </div>
                ))}
              </div>

              {entrega.motorista && (
                <div className="mt-4 pt-4 flex flex-col gap-2 text-sm border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <span style={{ color: "var(--text3)" }}>🚛 Motorista {entrega.motoristaCompl ? "(Principal)" : ""}:</span>
                    <span style={{ color: "var(--text2)" }} className="font-semibold">{entrega.motorista.nome}</span>
                    {entrega.veiculo?.placa && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {entrega.veiculo.placa}
                      </span>
                    )}
                  </div>
                  {entrega.motoristaCompl && (
                    <div className="flex items-center gap-2">
                      <span style={{ color: "#f97316" }}>🚛 Motorista Complementar:</span>
                      <span style={{ color: "var(--text2)" }} className="font-semibold">{entrega.motoristaCompl.nome}</span>
                      {entrega.veiculoCompl?.placa && (
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400 border border-orange-100 dark:border-orange-900/35">
                          {entrega.veiculoCompl.placa}
                        </span>
                      )}
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 uppercase tracking-widest font-mono">
                        Complemento
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className="rounded-2xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-5" style={{ color: "var(--text3)" }}>
                Linha do Tempo
              </div>
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-5 top-5 bottom-5 w-px" style={{ background: "var(--border)" }} />

                <div className="space-y-4">
                  {entrega.status === "OCORRENCIA" ? (
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 relative z-10"
                        style={{ background: "rgba(239,68,68,.15)", border: "2px solid #ef4444" }}>
                        ⚠️
                      </div>
                      <div>
                        <div className="font-semibold text-sm" style={{ color: "#ef4444" }}>Ocorrência</div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--text2)" }}>
                          Há uma ocorrência registrada. Nosso time está trabalhando na resolução.
                        </div>
                        {entrega.ocorrencias?.map((oc: any) => (
                          <div key={oc.id} className="mt-2 p-2.5 rounded-lg text-xs"
                            style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "var(--text2)" }}>
                            <strong>{oc.tipo.replace(/_/g, " ")}</strong>: {oc.descricao}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    STATUS_STEPS.map((step, i) => {
                      const done = i < currentIdx;
                      const current = i === currentIdx;
                      const future = i > currentIdx;
                      return (
                        <div key={step.key} className="flex items-start gap-4">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 relative z-10 transition-all"
                            style={{
                              background: done || current
                                ? `${STATUS_COLORS[step.key]}20`
                                : "var(--surface2)",
                              border: done || current
                                ? `2px solid ${STATUS_COLORS[step.key]}`
                                : "2px solid var(--border)",
                              opacity: future ? 0.4 : 1,
                              boxShadow: current ? `0 0 16px ${STATUS_COLORS[step.key]}40` : "none",
                            }}>
                            {step.icon}
                          </div>
                          <div className={future ? "opacity-40" : ""}>
                            <div className="font-semibold text-sm" style={{ color: current ? STATUS_COLORS[step.key] : done ? "var(--text)" : "var(--text2)" }}>
                              {step.label}
                              {current && <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded"
                                style={{ background: `${STATUS_COLORS[step.key]}20`, color: STATUS_COLORS[step.key] }}>ATUAL</span>}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: "var(--text3)" }}>{step.desc}</div>
                            {step.key === "ENTREGUE" && entrega.dataEntrega && (
                              <div className="text-xs mt-0.5 font-mono" style={{ color: "#10b981" }}>
                                Entregue em {fmtDate(entrega.dataEntrega)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* NFs */}
            {entrega.notas?.length > 0 && (
              <div className="rounded-2xl p-6 mt-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-4" style={{ color: "var(--text3)" }}>
                  Notas Fiscais ({entrega.notas.length})
                </div>
                <div className="space-y-2">
                  {entrega.notas.map((nf: any) => (
                    <div key={nf.id} className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                      <span className="text-lg">📄</span>
                      <div className="flex-1">
                        <div className="text-sm font-semibold">NF {nf.numero}{nf.serie ? `-${nf.serie}` : ""}</div>
                        <div className="text-xs" style={{ color: "var(--text3)" }}>{nf.emitenteRazao}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono" style={{ color: "#10b981" }}>
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(nf.valorNota)}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--text3)" }}>{nf.volumes} vol</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <p className="text-center text-xs mt-8" style={{ color: "var(--text3)" }}>
          MagnaLog TMS · Rastreamento em tempo real
        </p>
      </div>
    </div>
  );
}
