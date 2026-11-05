"use client";
import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { ItemConf } from "./tipos";

function Contador({ rotulo, valor, onChange }: { rotulo: string; valor: number; onChange: (n: number) => void }) {
  const ajustar = (n: number) => onChange(Math.max(0, Number.isFinite(n) ? n : 0));
  const btn = "h-14 w-14 rounded-lg flex items-center justify-center active:scale-95";
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold" style={{ color: "var(--text2)" }}>{rotulo}</div>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
          onClick={() => ajustar(valor - 1)}><Minus size={22} /></button>
        <input type="number" inputMode="decimal" min={0} value={valor}
          onChange={(e) => ajustar(parseFloat(e.target.value))}
          className="flex-1 min-w-0 h-14 text-center text-2xl font-bold rounded-lg outline-none"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
        <button type="button" className={btn} style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
          onClick={() => ajustar(valor + 1)}><Plus size={22} /></button>
      </div>
    </div>
  );
}

interface Props {
  item: ItemConf;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (dados: { qtdConferida: number; qtdAvaria: number; observacao: string }) => void;
}

export function ItemSheet({ item, salvando, onFechar, onSalvar }: Props) {
  const [conferida, setConferida] = useState(item.qtdConferida);
  const [avaria, setAvaria] = useState(item.qtdAvaria);
  const [obs, setObs] = useState(item.observacao || "");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onFechar}>
      <div className="w-full max-w-lg rounded-t-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-bold" style={{ color: "var(--text)" }}>{item.descricao}</div>
            <div className="text-xs" style={{ color: "var(--text2)" }}>cód. {item.codigoProduto || "—"}{item.unidade ? ` · ${item.unidade}` : ""}</div>
          </div>
          <button type="button" onClick={onFechar} className="h-10 w-10 flex items-center justify-center" style={{ color: "var(--text2)" }}>
            <X size={22} />
          </button>
        </div>
        <Contador rotulo="Quantidade contada" valor={conferida} onChange={setConferida} />
        <Contador rotulo="Quantidade avariada" valor={avaria} onChange={setAvaria} />
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observação"
          className="w-full p-3 rounded-lg text-base outline-none"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
        <Button size="lg" className="w-full h-12" loading={salvando}
          onClick={() => onSalvar({ qtdConferida: conferida, qtdAvaria: avaria, observacao: obs })}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
