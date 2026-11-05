"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import type { ItemConf } from "./tipos";

/**
 * Pop-up que abre a cada leitura: mostra o produto bipado e pede quantas
 * caixas o conferente esta vendo. Codigo fora da carga abre em vermelho.
 * Cega: mostra o que ja foi contado, nunca o esperado.
 */
export function QuantidadeModal({ codigo, itens, salvando, onConfirmar, onCancelar }: {
  codigo: string;
  itens: ItemConf[]; // linhas do produto (vazio = fora da carga)
  salvando: boolean;
  onConfirmar: (quantidade: number) => void;
  onCancelar: () => void;
}) {
  const [qtd, setQtd] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 50); }, []);

  const fora = itens.length === 0;
  const item = itens[0];
  const contadas = itens.reduce((s, i) => s + (i.qtdConferida || 0), 0);
  const nfs = Array.from(new Set(itens.map((i) => i.nfNumero).filter(Boolean))).join(", ");
  const n = Number(qtd.replace(",", "."));
  const valida = qtd !== "" && Number.isFinite(n) && n > 0;
  const confirmar = () => { if (valida && !salvando) onConfirmar(n); };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onCancelar}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
        style={{ background: "var(--surface)", border: `2px solid ${fora ? "#ef4444" : "var(--border)"}` }}
        onClick={(e) => e.stopPropagation()}>
        {fora ? (
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-red-500">Não pertence à carga</div>
            <div className="text-base font-bold mt-1" style={{ color: "var(--text)" }}>Código {codigo}</div>
            <p className="text-xs mt-1" style={{ color: "var(--text2)" }}>
              Este produto não está em nenhuma NF desta rota. Separe a caixa ou registre para virar sobra na conferência.
            </p>
          </div>
        ) : (
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest" style={{ color: "var(--text3)" }}>Produto bipado</div>
            <div className="text-lg font-bold leading-snug mt-1" style={{ color: "var(--text)" }}>{item.descricao}</div>
            <div className="text-xs font-mono mt-1" style={{ color: "var(--text2)" }}>
              cód. {item.codigoProduto}{nfs ? ` · NF ${nfs}` : ""} · {item.unidade || "CX"}
            </div>
            <div className="text-sm mt-2" style={{ color: "var(--text2)" }}>Já contadas: <b style={{ color: "var(--text)" }}>{contadas}</b></div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text2)" }}>
            Quantas {item?.unidade ? item.unidade.toLowerCase() : "caixas"} você está vendo?
          </label>
          <input ref={ref} type="number" inputMode="numeric" min={0} step="any" value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
            className="w-full text-3xl font-bold text-center py-3 rounded-xl outline-none"
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
        </div>

        <div className="flex gap-2">
          <Button size="lg" variant="ghost" className="flex-1 h-12" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button size="lg" variant={fora ? "danger" : "primary"} className="flex-1 h-12" onClick={confirmar} loading={salvando} disabled={!valida}>
            {fora ? "Registrar fora da carga" : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
