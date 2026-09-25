"use client";
import { useEffect, useState } from "react";
import { Card, Loading, Table, Th, Td, Tr } from "@/components/ui";
import { fmtBRL } from "../deposito-ui";

interface ProdutoResposta {
  codigo: string;
  descricao: string;
  ncm: string | null;
  unidade: string | null;
  quantidadeNF: number | null;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

interface RespostaProdutos {
  fonte: "AVARIA" | "NOTA_FISCAL" | "NENHUMA";
  produtos: ProdutoResposta[];
  totalValor: number;
}

const LABEL_FONTE: Record<string, string> = {
  AVARIA: "Da avaria vinculada",
  NOTA_FISCAL: "Da nota fiscal",
};

export function ProdutosCard({ itemId }: { itemId: string }) {
  const [dados, setDados] = useState<RespostaProdutos | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    fetch(`/api/deposito/${itemId}/produtos`)
      .then((res) => res.json())
      .then((data) => { if (ativo) setDados(data); })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [itemId]);

  if (loading) return <Card><Loading text="Carregando produtos..." /></Card>;
  if (!dados || dados.produtos.length === 0) return null;

  const { produtos, totalValor, fonte } = dados;
  const mostraQtdNF = fonte !== "NOTA_FISCAL";

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--text3)" }}>
          Produtos ({produtos.length})
        </span>
        <span className="text-[10px]" style={{ color: "var(--text3)" }}>{LABEL_FONTE[fonte] || ""}</span>
      </div>

      {/* Mobile: lista de cards */}
      <div className="block md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
        {produtos.map((p, i) => (
          <div key={i} className="p-3">
            <div className="text-sm font-medium">{p.descricao}</div>
            <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>Cód. {p.codigo}</div>
            <div className="text-[11px] mt-1 flex flex-wrap gap-x-3" style={{ color: "var(--text2)" }}>
              <span>NCM {p.ncm || "—"}</span>
              {mostraQtdNF && <span>Qtd NF {p.quantidadeNF ?? "—"}</span>}
              <span>Qtd {p.quantidade}</span>
              <span>Un. {fmtBRL(p.valorUnitario)}</span>
              <span className="font-bold">Total {fmtBRL(p.valorTotal)}</span>
            </div>
          </div>
        ))}
        <div className="p-3 flex items-center justify-between" style={{ background: "var(--surface2)" }}>
          <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text3)" }}>Total</span>
          <span className="text-sm font-bold font-mono">{fmtBRL(totalValor)}</span>
        </div>
      </div>

      {/* Desktop: tabela */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <thead>
            <Tr>
              <Th>Produto</Th>
              <Th>NCM</Th>
              {mostraQtdNF && <Th>Qtd NF</Th>}
              <Th>Qtd</Th>
              <Th>Valor un.</Th>
              <Th>Total</Th>
            </Tr>
          </thead>
          <tbody>
            {produtos.map((p, i) => (
              <Tr key={i}>
                <Td>
                  <div>{p.descricao}</div>
                  <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>Cód. {p.codigo}</div>
                </Td>
                <Td className="font-mono">{p.ncm || "—"}</Td>
                {mostraQtdNF && <Td className="font-mono">{p.quantidadeNF ?? "—"}</Td>}
                <Td className="font-mono">{p.quantidade}</Td>
                <Td className="font-mono">{fmtBRL(p.valorUnitario)}</Td>
                <Td className="font-mono font-bold">{fmtBRL(p.valorTotal)}</Td>
              </Tr>
            ))}
          </tbody>
          <tfoot>
            <Tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
              <Td colSpan={mostraQtdNF ? 5 : 4} className="text-right text-[10px] font-bold uppercase" style={{ color: "var(--text3)" }}>
                TOTAL
              </Td>
              <Td className="font-mono font-bold">{fmtBRL(totalValor)}</Td>
            </Tr>
          </tfoot>
        </Table>
      </div>
    </Card>
  );
}
