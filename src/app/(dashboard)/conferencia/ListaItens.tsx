"use client";
import { Trash2 } from "lucide-react";
import type { Conferencia, ItemConf } from "./tipos";

function Linha({ item, onAbrir, onRemover }: { item: ItemConf; onAbrir: () => void; onRemover?: () => void }) {
  const semCodigo = !item.ean && !item.eanUnidade;
  const fora = !!item.foraDaCarga;
  return (
    <div className="flex items-stretch gap-2">
      <button type="button" onClick={onAbrir}
        className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left p-3 rounded-lg active:scale-[0.99]"
        style={{
          background: fora ? "rgba(239,68,68,0.1)" : "var(--surface2)",
          border: `1px solid ${fora ? "rgba(239,68,68,0.4)" : "var(--border)"}`,
        }}>
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-snug" style={{ color: "var(--text)" }}>{item.descricao}</div>
          <div className="text-xs" style={{ color: "var(--text2)" }}>cód. {item.codigoProduto || "—"}</div>
          {semCodigo && !fora && <div className="text-xs text-amber-400">sem código — toque para contar</div>}
          {item.qtdAvaria > 0 && (
            <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
              {item.qtdAvaria} avariada(s)
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold leading-none" style={{ color: fora ? "#f87171" : "var(--text)" }}>{item.qtdConferida}</div>
          <div className="text-xs" style={{ color: "var(--text2)" }}>{item.unidade || "un"}</div>
        </div>
      </button>
      {onRemover && (
        <button type="button" onClick={onRemover} aria-label="Desfazer linha"
          className="w-12 rounded-lg flex items-center justify-center bg-red-500/10 text-red-400 border border-red-500/30">
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
}

interface Props {
  conf: Conferencia;
  onAbrir: (item: ItemConf) => void;
  onRemover: (item: ItemConf) => void;
}

export function ListaItens({ conf, onAbrir, onRemover }: Props) {
  const fora = conf.itens.filter((i) => i.foraDaCarga);
  const dentro = conf.itens.filter((i) => !i.foraDaCarga);

  // entrega -> NF -> itens, mantendo a ordem em que aparecem
  const entregas = new Map<string, Map<string, ItemConf[]>>();
  for (const it of dentro) {
    const e = it.entregaId || "";
    const nf = String(it.nfNumero ?? "");
    if (!entregas.has(e)) entregas.set(e, new Map());
    const nfs = entregas.get(e)!;
    nfs.set(nf, [...(nfs.get(nf) || []), it]);
  }

  return (
    <div className="space-y-5">
      {fora.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-red-400">Fora da carga</h3>
          {fora.map((it) => (
            <Linha key={it.id} item={it} onAbrir={() => onAbrir(it)} onRemover={() => onRemover(it)} />
          ))}
        </section>
      )}
      {Array.from(entregas.entries()).map(([entregaId, nfs]) => (
        <section key={entregaId} className="space-y-3">
          <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>{conf.entregas[entregaId] || "Entrega"}</h3>
          {Array.from(nfs.entries()).map(([nf, itens]) => (
            <div key={nf} className="space-y-2">
              <div className="text-xs font-semibold" style={{ color: "var(--text2)" }}>NF {nf || "—"}</div>
              {itens.map((it) => <Linha key={it.id} item={it} onAbrir={() => onAbrir(it)} />)}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
