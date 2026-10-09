"use client";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import type { TipoVeiculo } from "@prisma/client";
import { Button, Modal } from "@/components/ui";
import { paletesPorNF, dividirEmVeiculos } from "@/lib/paletes-por-nf";
import { TIPO_LABEL, getCapacidadesPadrao } from "@/lib/veiculo-capacidades";

const fmtKg = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

export function DividirVeiculosModal({ open, onClose, entrega, onDividido }: {
  open: boolean; onClose: () => void; entrega: any; onDividido: () => void;
}) {
  const [qtd, setQtd] = useState(2);
  const [tipo, setTipo] = useState<"" | TipoVeiculo>("");
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const nfs = useMemo(() => paletesPorNF(entrega?.notas || []), [entrega?.notas]);
  const opcoes = [2, 3, 4, 5].filter((n) => n <= nfs.length);
  const veiculos = useMemo(() => dividirEmVeiculos(nfs, qtd), [nfs, qtd]);
  const totalPaletes = nfs.reduce((s, n) => s + n.paletes, 0);
  const cap = tipo ? getCapacidadesPadrao(tipo).paletes : 0;

  // Reinicia o estado ao abrir
  useEffect(() => {
    if (open) { setQtd(2); setTipo(""); setConfirmando(false); }
  }, [open]);

  const mudar = (fn: () => void) => { fn(); setConfirmando(false); };

  async function confirmar() {
    setSalvando(true);
    try {
      const res = await fetch(`/api/entregas/${entrega.id}/dividir-veiculos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grupos: veiculos.map((v) => ({ notaIds: v.nfs.map((n) => n.notaId), paletes: v.paletes })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao dividir a entrega");
      toast.success(`Entrega dividida em ${veiculos.length}`);
      onDividido();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao dividir a entrega");
    } finally {
      setSalvando(false);
    }
  }

  const label = "block text-[10px] font-mono uppercase tracking-widest font-bold mb-1";

  return (
    <Modal open={open} onClose={onClose} title="Dividir em veículos" size="lg">
      {nfs.length < 2 ? (
        <p className="text-sm" style={{ color: "var(--text2)" }}>Só há uma NF — não há o que dividir.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className={label} style={{ color: "var(--text3)" }}>Quantos veículos</span>
              <div className="flex gap-2">
                {opcoes.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => mudar(() => setQtd(n))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-bold transition-all ${qtd === n ? "bg-orange-500 text-white border-orange-500" : ""}`}
                    style={qtd === n ? undefined : { background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text2)" }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={label} style={{ color: "var(--text3)" }}>Tipo de veículo (opcional)</label>
              <select
                value={tipo}
                onChange={(e) => mudar(() => setTipo(e.target.value as "" | TipoVeiculo))}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <option value="">—</option>
                {(Object.keys(TIPO_LABEL) as TipoVeiculo[]).map((t) => (
                  <option key={t} value={t}>{TIPO_LABEL[t]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs" style={{ color: "var(--text3)" }}>
            Total: <b style={{ color: "var(--text)" }}>{totalPaletes} paletes</b>
            {tipo && cap > 0 && (
              <> · mínimo de <b style={{ color: "var(--text)" }}>{Math.ceil(totalPaletes / cap)}</b> {TIPO_LABEL[tipo]} ({cap} paletes cada)</>
            )}
          </div>

          <div className="space-y-2">
            {veiculos.map((v, i) => (
              <div key={i} className="rounded-xl border p-3" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>
                    Veículo {i + 1} {i === 0 ? "(fica nesta entrega)" : "(nova entrega)"}
                  </span>
                  {cap > 0 && v.paletes > cap && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
                      passa da capacidade ({cap} paletes)
                    </span>
                  )}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text2)" }}>
                  <b>{v.paletes}</b> paletes · {fmtKg(v.pesoKg)} kg · {v.volumes.toLocaleString("pt-BR")} volumes
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {v.nfs.map((n) => (
                    <span key={n.notaId} className="text-[11px] font-mono px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text2)" }}>
                      NF {n.numero} · {n.paletes}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {confirmando && (
            <div className="text-xs rounded-lg border px-3 py-2 text-amber-500 border-amber-500/30 bg-amber-500/10">
              Isso cria {veiculos.length - 1} entrega(s) nova(s) com a mesma agenda. Confirmar?
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button
              variant={confirmando ? "danger" : "primary"}
              loading={salvando}
              disabled={veiculos.length < 2}
              onClick={() => (confirmando ? confirmar() : setConfirmando(true))}
            >
              {confirmando ? "Confirmar" : `Separar em ${veiculos.length} entregas`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
