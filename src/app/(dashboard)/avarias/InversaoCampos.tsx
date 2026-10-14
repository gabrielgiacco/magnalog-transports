"use client";
import { useState } from "react";

export interface OpcaoInversao { codigo: string; descricao: string }

interface Props {
  codigoProduto: string;
  descricaoProduto: string;
  invertidoCodigo?: string;
  invertidoDescricao?: string;
  invertidoQuantidade?: number;
  opcoes: OpcaoInversao[];
  onChange: (patch: { invertidoCodigo?: string; invertidoDescricao?: string; invertidoQuantidade?: number }) => void;
}

const estilo = { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" };

// Pergunta qual item veio no lugar do produto faltante (inversão)
export function InversaoCampos({ codigoProduto, descricaoProduto, invertidoCodigo, invertidoDescricao, invertidoQuantidade, opcoes, onChange }: Props) {
  const lista = opcoes.filter((o) => !(o.codigo === codigoProduto && o.descricao === descricaoProduto));
  const idxAtual = lista.findIndex((o) => o.codigo === invertidoCodigo && o.descricao === invertidoDescricao);
  const [outro, setOutro] = useState(!!invertidoDescricao && idxAtual < 0);

  function escolher(v: string) {
    if (v === "__outro") { setOutro(true); onChange({ invertidoCodigo: "", invertidoDescricao: "" }); return; }
    setOutro(false);
    const o = lista[Number(v)];
    onChange(o ? { invertidoCodigo: o.codigo, invertidoDescricao: o.descricao } : { invertidoCodigo: "", invertidoDescricao: "" });
  }

  return (
    <div className="rounded-lg p-2 space-y-2 text-xs" style={{ borderLeft: "3px solid #8b5cf6", background: "rgba(139,92,246,0.08)" }}>
      <div className="font-bold" style={{ color: "#8b5cf6" }}>Veio no lugar:</div>
      <select value={outro ? "__outro" : idxAtual >= 0 ? String(idxAtual) : ""}
        onChange={(e) => escolher(e.target.value)}
        className="w-full px-2 py-1 rounded text-xs outline-none" style={estilo}>
        <option value="">— escolha o item —</option>
        {lista.map((o, i) => <option key={i} value={String(i)}>{o.codigo} · {o.descricao}</option>)}
        <option value="__outro">Outro item (digitar)</option>
      </select>
      {outro && (
        <div className="flex flex-wrap gap-2">
          <input type="text" placeholder="Código (opcional)" value={invertidoCodigo || ""}
            onChange={(e) => onChange({ invertidoCodigo: e.target.value })}
            className="w-28 px-2 py-1 rounded text-xs outline-none" style={estilo} />
          <input type="text" placeholder="Descrição (obrigatória)" value={invertidoDescricao || ""}
            onChange={(e) => onChange({ invertidoDescricao: e.target.value })}
            className="flex-1 min-w-[10rem] px-2 py-1 rounded text-xs outline-none" style={estilo} />
        </div>
      )}
      <label className="flex items-center gap-2" style={{ color: "var(--text2)" }}>
        Quantidade que veio
        <input type="number" min={0} step="any" value={invertidoQuantidade ?? ""}
          onChange={(e) => onChange({ invertidoQuantidade: parseFloat(e.target.value) || 0 })}
          className="w-20 px-2 py-1 rounded text-right font-mono text-xs outline-none" style={estilo} />
      </label>
    </div>
  );
}
