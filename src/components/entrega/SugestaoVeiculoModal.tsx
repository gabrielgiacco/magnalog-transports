"use client";
import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Button, Modal } from "@/components/ui";
import { Truck, Check, AlertTriangle, Loader2, User, History, Package } from "lucide-react";
import { TIPO_LABEL } from "@/lib/veiculo-capacidades";

type VeiculoSug = {
  id: string;
  placa: string;
  tipo: keyof typeof TIPO_LABEL;
  modelo: string | null;
  motoristaNome: string | null;
  capacidadePaletes: number;
  capacidadeM3: number;
  origemPaletes: "individual" | "padrao";
  origemM3: "individual" | "padrao";
  aproveitamento: number | null;
  cabe: boolean | null;
  atual: boolean;
  historico: { usos: number; totalEntregas: number; confianca: number } | null;
};

type Resposta = {
  carga: { paletes: number; m3: number | null; fonte: "paletes" | "m3" | "sem_dados"; ncmsPrincipais: string[] };
  baseHistorico: { totalEntregas: number; filtradoPorNcm: boolean } | null;
  veiculoAtualId: string | null;
  veiculos: VeiculoSug[];
};

interface Props {
  open: boolean;
  onClose: () => void;
  entregaId: string | null;
  onAtribuido?: () => void;
}

export function SugestaoVeiculoModal({ open, onClose, entregaId, onAtribuido }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Resposta | null>(null);
  const [atribuindoId, setAtribuindoId] = useState<string | null>(null);

  const fetchSugestao = useCallback(async () => {
    if (!entregaId) return;
    setLoading(true);
    setData(null);
    try {
      const r = await fetch(`/api/entregas/${entregaId}/sugerir-veiculo`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao buscar sugestão");
      setData(d);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [entregaId]);

  useEffect(() => {
    if (open && entregaId) fetchSugestao();
  }, [open, entregaId, fetchSugestao]);

  async function atribuir(veiculoId: string) {
    if (!entregaId) return;
    setAtribuindoId(veiculoId);
    try {
      const r = await fetch(`/api/entregas/${entregaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiculoId }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast.success("Veículo atribuído");
      onAtribuido?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao atribuir");
    } finally {
      setAtribuindoId(null);
    }
  }

  function badgeAproveitamento(v: VeiculoSug) {
    if (v.aproveitamento == null) return null;
    const pct = Math.round(v.aproveitamento * 100);
    let color = "#10b981";
    let bg = "rgba(16,185,129,0.1)";
    if (pct > 100) { color = "#ef4444"; bg = "rgba(239,68,68,0.1)"; }
    else if (pct > 85) { color = "#f59e0b"; bg = "rgba(245,158,11,0.1)"; }
    return (
      <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ color, background: bg }}>
        {pct}% {v.cabe ? "" : "· NÃO CABE"}
      </span>
    );
  }

  const nenhumCabe = data && data.carga.fonte !== "sem_dados" && data.veiculos.every((v) => v.cabe === false);

  return (
    <Modal open={open} onClose={onClose} title="Sugestão de Veículo" size="lg">
      {loading && (
        <div className="flex items-center justify-center py-12 gap-2 text-sm" style={{ color: "var(--text2)" }}>
          <Loader2 size={16} className="animate-spin" /> Calculando sugestão...
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Cabeçalho — resumo da carga */}
          <div className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            {data.carga.fonte === "paletes" && (
              <div className="flex items-center gap-2 text-sm">
                <Package size={16} style={{ color: "var(--accent)" }} />
                <span>Carga: <b>{data.carga.paletes} paletes</b> <span style={{ color: "var(--text3)" }}>(cadastrado)</span></span>
              </div>
            )}
            {data.carga.fonte === "m3" && (
              <div className="flex items-center gap-2 text-sm">
                <Package size={16} style={{ color: "var(--accent)" }} />
                <span>Carga: <b>{data.carga.m3?.toFixed(1)} m³</b> <span style={{ color: "var(--text3)" }}>(extraído dos Dados Adicionais da NF)</span></span>
              </div>
            )}
            {data.carga.fonte === "sem_dados" && data.baseHistorico && (
              <div className="flex items-start gap-2 text-sm">
                <History size={16} style={{ color: "#3b82f6", marginTop: 2 }} />
                <div>
                  <div><b>Sem paletização/M³</b></div>
                  <div className="text-xs mt-1" style={{ color: "var(--text2)" }}>
                    Sugestão baseada no histórico: {data.baseHistorico.totalEntregas} entrega(s) anteriores deste cliente
                    {data.baseHistorico.filtradoPorNcm ? " filtradas por produtos em comum" : ""}.
                  </div>
                </div>
              </div>
            )}
            {data.carga.fonte === "sem_dados" && !data.baseHistorico && (
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle size={16} style={{ color: "#f59e0b", marginTop: 2 }} />
                <div>
                  <div><b>Sem dados suficientes</b></div>
                  <div className="text-xs mt-1" style={{ color: "var(--text2)" }}>
                    Cadastre a quantidade de paletes na entrega ou confira os Dados Adicionais das NFs (procure por "M3:").
                    Histórico deste cliente também não tem entregas anteriores suficientes.
                  </div>
                </div>
              </div>
            )}
          </div>

          {nenhumCabe && (
            <div className="rounded-xl p-3 flex items-start gap-2 text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <AlertTriangle size={16} style={{ color: "#ef4444", marginTop: 2 }} />
              <div>
                <b>Nenhum veículo cadastrado comporta essa carga.</b>
                <div className="text-xs mt-1" style={{ color: "var(--text2)" }}>Considere fracionar a carga ou usar uma CARRETA (100 m³ / 28 paletes).</div>
              </div>
            </div>
          )}

          {/* Lista de veículos */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {data.veiculos.map((v) => (
              <div key={v.id} className="rounded-xl p-3 flex items-center gap-3 transition-colors"
                style={{
                  background: v.atual ? "rgba(59,130,246,0.08)" : "var(--surface)",
                  border: `1px solid ${v.atual ? "rgba(59,130,246,0.4)" : "var(--border)"}`,
                }}>
                <Truck size={22} style={{ color: v.cabe === false ? "#ef4444" : v.historico ? "#3b82f6" : "var(--accent)", flexShrink: 0 }} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold">{v.placa}</span>
                    <span className="text-xs" style={{ color: "var(--text2)" }}>{TIPO_LABEL[v.tipo]}</span>
                    {v.modelo && <span className="text-xs" style={{ color: "var(--text3)" }}>· {v.modelo}</span>}
                    {v.atual && <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>ATUAL</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] font-mono flex-wrap" style={{ color: "var(--text3)" }}>
                    {v.motoristaNome && <span className="inline-flex items-center gap-1"><User size={11} />{v.motoristaNome}</span>}
                    <span>
                      Cap: {v.capacidadePaletes}pal / {v.capacidadeM3}m³
                      {(v.origemPaletes === "padrao" || v.origemM3 === "padrao") && " (padrão)"}
                    </span>
                    {v.historico && (
                      <span className="inline-flex items-center gap-1" style={{ color: "#3b82f6" }}>
                        <History size={11} /> {v.historico.usos}× com este cliente
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {badgeAproveitamento(v)}
                  <Button size="sm" variant={v.atual ? "ghost" : "primary"}
                    disabled={v.atual || atribuindoId != null}
                    onClick={() => atribuir(v.id)}>
                    {atribuindoId === v.id ? <Loader2 size={13} className="animate-spin" /> : v.atual ? <><Check size={13} /> Atual</> : "Atribuir"}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {data.veiculos.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: "var(--text3)" }}>
              Nenhum veículo ativo cadastrado. Cadastre em /frota.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
