"use client";
import { ReactNode } from "react";
import { Button, Card } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export type TipoContaPagar = "MOTORISTA" | "DESCARGA" | "ABASTECIMENTO" | "PEDAGIO" | "OUTROS";

/** Uma NF-e já classificada em FRETE ou COMPRA por /api/sincronizacao/classificar. */
export type NfClassificada = {
  chave: string; emitenteCnpj: string; emitenteRazao: string;
  destinatarioCnpj: string; destinatarioRazao: string;
  numero: string; serie: string | null; dataEmissao: string | null; valorTotal: number;
  classe: "FRETE" | "COMPRA"; tipoSugerido: TipoContaPagar; jaExiste: boolean;
};

// A lista "Faltando no TMS" reaproveita este mesmo componente, mas só tem
// chave — daí o resto dos campos ser opcional aqui.
type ItemLista = { chave: string; jaExiste: boolean } & Partial<NfClassificada>;

const TIPO_OPCOES: { value: TipoContaPagar; label: string }[] = [
  { value: "MOTORISTA", label: "Motorista" },
  { value: "DESCARGA", label: "Descarga / Chapa" },
  { value: "ABASTECIMENTO", label: "Combustível" },
  { value: "PEDAGIO", label: "Pedágio" },
  { value: "OUTROS", label: "Outros" },
];

interface ListaClassificadaProps {
  titulo: string;
  modo: "faltando" | "frete" | "compra";
  itens: ItemLista[];
  selecionadas: Set<string>;
  onAlternar: (chave: string) => void;
  onMarcarTodas: () => void;
  onLimpar: () => void;
  acaoLabel: string;
  acaoIcon: ReactNode;
  onAcao: () => void;
  acaoCarregando: boolean;
  nota?: string;
  tiposCompra?: Map<string, TipoContaPagar>;
  onAlterarTipo?: (chave: string, tipo: TipoContaPagar) => void;
}

function Colunas({ modo, item, tiposCompra, onAlterarTipo }: {
  modo: ListaClassificadaProps["modo"];
  item: ItemLista;
  tiposCompra?: Map<string, TipoContaPagar>;
  onAlterarTipo?: (chave: string, tipo: TipoContaPagar) => void;
}) {
  if (modo === "faltando") {
    return <span className="font-mono text-[11px] break-all" style={{ color: "var(--text2)" }}>{item.chave}</span>;
  }
  if (modo === "frete") {
    return (
      <>
        <span className="font-mono text-[11px] break-all flex-1" style={{ color: "var(--text2)" }}>{item.chave}</span>
        <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text3)" }}>{formatCurrency(item.valorTotal || 0)}</span>
      </>
    );
  }
  // modo === "compra": tipo é só um palpite pelo nome do fornecedor — o usuário troca aqui se precisar.
  return (
    <>
      <span className="text-[11px] truncate flex-1" title={item.emitenteRazao}>{item.emitenteRazao}</span>
      <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text3)" }}>NF {item.numero}</span>
      <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text3)" }}>
        {item.dataEmissao ? new Date(item.dataEmissao).toLocaleDateString("pt-BR") : "—"}
      </span>
      <span className="text-[11px] flex-shrink-0 font-semibold">{formatCurrency(item.valorTotal || 0)}</span>
      <select
        value={tiposCompra?.get(item.chave) || item.tipoSugerido}
        onChange={(e) => onAlterarTipo?.(item.chave, e.target.value as TipoContaPagar)}
        disabled={item.jaExiste}
        className="text-[11px] px-1.5 py-1 rounded outline-none flex-shrink-0"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
      >
        {TIPO_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </>
  );
}

/**
 * Lista usada pelas três seções da sincronização (faltando no TMS, frete,
 * compras/despesas): cabeçalho com contagem + "marcar todas"/"limpar" +
 * botão de ação, e uma linha por item com checkbox. Item com `jaExiste` fica
 * desabilitado e esmaecido — nunca pode ser selecionado de novo.
 */
export function ListaClassificada({
  titulo, modo, itens, selecionadas, onAlternar, onMarcarTodas, onLimpar,
  acaoLabel, acaoIcon, onAcao, acaoCarregando, nota, tiposCompra, onAlterarTipo,
}: ListaClassificadaProps) {
  if (itens.length === 0) return null;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono uppercase tracking-widest font-bold" style={{ color: "var(--text3)" }}>
            {titulo} ({itens.length})
          </span>
          <button onClick={onMarcarTodas} className="text-[11px] hover:opacity-70" style={{ color: "var(--accent)" }}>
            Marcar todas
          </button>
          <button onClick={onLimpar} className="text-[11px] hover:opacity-70" style={{ color: "var(--text3)" }}>
            Limpar
          </button>
        </div>
        <Button size="sm" onClick={onAcao} disabled={acaoCarregando || selecionadas.size === 0}>
          {acaoCarregando ? <Loader2 size={13} className="animate-spin" /> : acaoIcon}
          {acaoLabel} {selecionadas.size > 0 ? `(${selecionadas.size})` : ""}
        </Button>
      </div>

      {nota && (
        <div className="px-4 py-2 text-[11px]" style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
          {nota}
        </div>
      )}

      <div className="max-h-[50vh] overflow-y-auto">
        {itens.map((item, i) => (
          <div
            key={item.chave}
            className="w-full flex items-center gap-3 px-4 py-2"
            style={{
              borderTop: i > 0 ? "1px solid var(--border)" : "none",
              background: selecionadas.has(item.chave) ? "rgba(249,115,22,.08)" : "transparent",
              opacity: item.jaExiste ? 0.5 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={selecionadas.has(item.chave)}
              disabled={item.jaExiste}
              onChange={() => onAlternar(item.chave)}
              className="accent-orange-500 flex-shrink-0"
            />
            <div className="flex-1 flex items-center gap-3 min-w-0">
              <Colunas modo={modo} item={item} tiposCompra={tiposCompra} onAlterarTipo={onAlterarTipo} />
            </div>
            {item.jaExiste && (
              <span className="text-[10px] flex-shrink-0" style={{ color: "var(--text3)" }}>já importada</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
