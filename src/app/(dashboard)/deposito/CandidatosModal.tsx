"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Modal, Button, Loading, Empty } from "@/components/ui";

// Contrato de GET /api/deposito/candidatos — não mudar sem mudar a rota.
type OrigemCandidato = "NOTA_DEVOLUCAO" | "AVARIA" | "ENTREGA";
interface CandidatoDeposito {
  origem: OrigemCandidato;
  refId: string;
  referencia: string;
  descricao: string;
  embarcadorCnpj: string;
  embarcadorRazao: string;
  embarcadorIncerto: boolean;
  notaNumero: string | null;
  notaSerie: string | null;
  notaChave: string | null;
  volumes: number;
  pesoKg: number;
  valorMercadoria: number;
  dataSugerida: string;
  tipoEntradaSugerido: string;
  detalhe: string;
  avariaId: string | null;
  entregaId: string | null;
  notaFiscalId: string | null;
  ocorrenciaId: string | null;
}
interface EditRow {
  selected: boolean;
  volumes: number;
  localizacao: string;
  embarcadorCnpj: string;
  embarcadorRazao: string;
}

const SECOES: { origem: OrigemCandidato; titulo: string }[] = [
  { origem: "NOTA_DEVOLUCAO", titulo: "Notas de devolução" },
  { origem: "AVARIA", titulo: "Avarias" },
  { origem: "ENTREGA", titulo: "Entregas em ocorrência" },
];

const key = (c: { origem: string; refId: string }) => `${c.origem}:${c.refId}`;

export function CandidatosModal({ open, onClose, onImportado }: {
  open: boolean; onClose: () => void; onImportado: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [candidatos, setCandidatos] = useState<CandidatoDeposito[]>([]);
  const [totais, setTotais] = useState({ NOTA_DEVOLUCAO: 0, AVARIA: 0, ENTREGA: 0 });
  const [edits, setEdits] = useState<Record<string, EditRow>>({});
  const [ignorados, setIgnorados] = useState<Map<string, string>>(new Map());
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Record<OrigemCandidato, boolean>>({
    NOTA_DEVOLUCAO: true, AVARIA: false, ENTREGA: false,
  });
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusca("");
    setIgnorados(new Map());
    setLoading(true);
    fetch("/api/deposito/candidatos?take=300")
      .then((r) => r.json())
      .then((data) => {
        const lista: CandidatoDeposito[] = data.candidatos || [];
        setCandidatos(lista);
        setTotais(data.totais || { NOTA_DEVOLUCAO: 0, AVARIA: 0, ENTREGA: 0 });
        const iniciais: Record<string, EditRow> = {};
        for (const c of lista) {
          iniciais[key(c)] = {
            selected: false,
            volumes: Math.max(1, c.volumes || 1),
            localizacao: "",
            embarcadorCnpj: c.embarcadorCnpj || "",
            embarcadorRazao: c.embarcadorRazao || "",
          };
        }
        setEdits(iniciais);
      })
      .catch(() => toast.error("Erro ao carregar candidatos"))
      .finally(() => setLoading(false));
  }, [open]);

  function updateEdit(k: string, patch: Partial<EditRow>) {
    setEdits((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  }

  const buscaLower = busca.trim().toLowerCase();
  const visiveis = candidatos.filter((c) =>
    !buscaLower || `${c.referencia} ${c.descricao} ${c.embarcadorRazao}`.toLowerCase().includes(buscaLower)
  );

  const selecionados = candidatos.filter((c) => edits[key(c)]?.selected);
  const totalVolumes = selecionados.reduce((s, c) => s + (edits[key(c)]?.volumes || 0), 0);
  const bloqueado = selecionados.some((c) => {
    const e = edits[key(c)];
    if (!e) return false;
    if (!e.volumes || e.volumes < 1) return true;
    if (c.embarcadorIncerto && (!e.embarcadorCnpj.trim() || !e.embarcadorRazao.trim())) return true;
    return false;
  });

  async function handleImportar() {
    if (selecionados.length === 0 || bloqueado) return;
    setImportando(true);
    try {
      const itens = selecionados.map((c) => {
        const e = edits[key(c)];
        return {
          origem: c.origem,
          refId: c.refId,
          tipoEntrada: c.tipoEntradaSugerido,
          volumes: e.volumes,
          localizacao: e.localizacao.trim() || undefined,
          embarcadorCnpj: c.embarcadorIncerto ? e.embarcadorCnpj.replace(/\D/g, "") : undefined,
          embarcadorRazao: c.embarcadorIncerto ? e.embarcadorRazao.trim() : undefined,
        };
      });
      const res = await fetch("/api/deposito/importar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao importar"); return; }
      if (data.criados > 0) {
        toast.success(`${data.criados} item(ns) importado(s) para o depósito`);
        onImportado();
      }
      const listaIgnorados: { refId: string; motivo: string }[] = data.ignorados || [];
      if (listaIgnorados.length > 0) {
        const motivos = new Map(listaIgnorados.map((i) => [i.refId, i.motivo]));
        setIgnorados(motivos);
        setCandidatos((prev) => prev.filter((c) => !edits[key(c)]?.selected || motivos.has(c.refId)));
      } else {
        onClose();
      }
    } catch {
      toast.error("Erro ao importar");
    } finally {
      setImportando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Candidatos ao depósito" size="xl">
      <p className="text-xs mb-4" style={{ color: "var(--text3)" }}>
        Itens que o sistema já conhece e podem estar parados no depósito. Confira os números antes de importar.
      </p>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar referência, descrição ou embarcador..."
          className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
      </div>

      {loading ? <Loading /> : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {SECOES.map((s) => {
            const itens = visiveis.filter((c) => c.origem === s.origem);
            return (
              <Secao key={s.origem} titulo={s.titulo} count={totais[s.origem] ?? 0}
                aberto={abertos[s.origem]} onToggle={() => setAbertos((p) => ({ ...p, [s.origem]: !p[s.origem] }))}>
                {itens.length === 0 ? (
                  <div className="py-4 text-center text-xs" style={{ color: "var(--text3)" }}>Nenhum item</div>
                ) : itens.map((c) => (
                  <Linha key={key(c)} c={c} edit={edits[key(c)]} motivo={ignorados.get(c.refId)}
                    onChange={(patch) => updateEdit(key(c), patch)} />
                ))}
              </Secao>
            );
          })}
          {candidatos.length === 0 && <Empty icon="📦" text="Nenhum candidato encontrado" />}
        </div>
      )}

      <div className="sticky bottom-0 flex items-center justify-between gap-3 mt-4 pt-3 -mx-4 sm:-mx-6 px-4 sm:px-6"
        style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
        <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>
          {selecionados.length} selecionados · {totalVolumes} volumes
        </span>
        <Button loading={importando} disabled={selecionados.length === 0 || bloqueado} onClick={handleImportar}>
          Importar para o depósito
        </Button>
      </div>
    </Modal>
  );
}

function Secao({ titulo, count, aberto, onToggle, children }: {
  titulo: string; count: number; aberto: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2"
        style={{ background: "var(--surface2)" }}>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text2)" }}>{titulo}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface)", color: "var(--text3)" }}>{count}</span>
          {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>
      {aberto && <div className="divide-y" style={{ borderColor: "var(--border)" }}>{children}</div>}
    </div>
  );
}

function Linha({ c, edit, motivo, onChange }: {
  c: CandidatoDeposito; edit: EditRow; motivo?: string; onChange: (patch: Partial<EditRow>) => void;
}) {
  if (!edit) return null;
  const faltaEmbarcador = c.embarcadorIncerto && edit.selected && (!edit.embarcadorCnpj.trim() || !edit.embarcadorRazao.trim());
  return (
    <div className="flex items-start gap-2 px-3 py-2">
      <input type="checkbox" checked={edit.selected} onChange={(e) => onChange({ selected: e.target.checked })}
        className="mt-1.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold font-mono" style={{ color: "var(--accent)" }}>{c.referencia}</span>
          {c.embarcadorIncerto && (
            <span title="Embarcador não identificado — informe antes de importar">
              <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
            </span>
          )}
        </div>
        <div className="text-xs truncate" style={{ color: "var(--text)" }}>{c.descricao}</div>
        <div className="text-[10px] truncate" style={{ color: "var(--text3)" }}>{c.detalhe}</div>
        {c.embarcadorIncerto ? (
          <div className="flex flex-col sm:flex-row gap-1.5 mt-1.5">
            <input value={edit.embarcadorRazao} onChange={(e) => onChange({ embarcadorRazao: e.target.value })}
              placeholder="Razão social do embarcador"
              className="flex-1 px-2 py-1 rounded text-[11px] outline-none"
              style={{ background: "var(--surface2)", border: `1px solid ${faltaEmbarcador ? "#ef4444" : "var(--border)"}`, color: "var(--text)" }} />
            <input value={edit.embarcadorCnpj} onChange={(e) => onChange({ embarcadorCnpj: e.target.value })}
              placeholder="CNPJ"
              className="w-36 px-2 py-1 rounded text-[11px] outline-none font-mono"
              style={{ background: "var(--surface2)", border: `1px solid ${faltaEmbarcador ? "#ef4444" : "var(--border)"}`, color: "var(--text)" }} />
          </div>
        ) : (
          <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text3)" }}>{c.embarcadorRazao}</div>
        )}
        {motivo && <div className="text-[10px] mt-1 font-bold" style={{ color: "#ef4444" }}>Não importado: {motivo}</div>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input type="number" min={1} value={edit.volumes}
          onChange={(e) => onChange({ volumes: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          className="w-14 px-1.5 py-1 rounded text-[11px] text-center outline-none"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
        <input value={edit.localizacao} onChange={(e) => onChange({ localizacao: e.target.value })} placeholder="Local"
          className="w-24 px-1.5 py-1 rounded text-[11px] outline-none"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
      </div>
    </div>
  );
}
