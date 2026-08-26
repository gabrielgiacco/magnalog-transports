import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const qtdFmt = (q: number) => (q % 1 === 0 ? String(q) : q.toFixed(2));

const monthPtBr = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();

export default async function OrcamentoPage({ params }: { params: { id: string } }) {
  const orc = await prisma.orcamento.findUnique({
    where: { id: params.id },
    include: {
      criadoPor: { select: { name: true } },
      itens: { orderBy: { descricao: "asc" } },
    },
  });

  if (!orc) return notFound();

  const data = orc.createdAt || new Date();
  const dataStr = `Aparecida de Goiânia, ${data.getDate()} de ${monthPtBr(data)} de ${data.getFullYear()}`;

  // Fornecedores presentes — se for um só, cabeçalho mostra; senão "DIVERSOS"
  const fornecedores = Array.from(new Set(orc.itens.map((i) => i.fornecedorNome).filter(Boolean)));
  const fornecedorLabel = fornecedores.length === 1 ? fornecedores[0] : fornecedores.length > 1 ? "DIVERSOS" : "—";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        body { font-family: "Times New Roman", Times, serif; color: #000; padding: 30px 40px; margin: 0; background: #fff; font-size: 12px; line-height: 1.45; }
        .doc { max-width: 720px; margin: 0 auto; position: relative; }
        .header { display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
        .logo { width: 130px; height: auto; }
        .company { flex: 1; text-align: center; }
        .company-name { font-weight: bold; font-size: 15px; margin-bottom: 2px; }
        .doc-title { font-style: italic; text-decoration: underline; font-weight: bold; font-size: 13px; }
        .codigo { text-align: right; font-weight: bold; margin-bottom: 10px; }
        .field { margin-bottom: 3px; }
        .divisor { border-top: 1px dashed #666; margin: 12px 0; }
        table.itens { width: 100%; border-collapse: collapse; margin-top: 10px; }
        table.itens th { text-align: left; border-bottom: 1px solid #000; padding: 4px; font-size: 11px; }
        table.itens td { padding: 4px; vertical-align: top; border-bottom: 1px dotted #bbb; }
        .num { text-align: right; white-space: nowrap; }
        .cen { text-align: center; }
        .cod { font-family: "Courier New", monospace; font-size: 11px; }
        .total { margin-top: 14px; text-align: right; font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 6px; }
        .nota-un { margin-top: 10px; font-size: 11px; font-style: italic; }
        .obs { margin-top: 14px; }
        .footer-data { text-align: center; margin: 36px 0 40px; font-style: italic; }
        .emitido { margin-top: 30px; font-weight: bold; }

        .btn-print-wrap { position: fixed; top: 12px; right: 12px; z-index: 999; }
        .btn-print { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.15); font-family: Arial, sans-serif; }
        .btn-print:hover { background: #1d4ed8; }

        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body { padding: 0; }
          .no-print { display: none !important; }
          /* Reafirma os layouts em linha. Regras globais de impressao ja
             forcaram display:block aqui uma vez, empilhando o que devia
             ficar lado a lado. */
          .header { display: flex !important; }
          table.itens tr { break-inside: avoid; }
        }
      ` }} />

      <div className="no-print btn-print-wrap">
        <button id="btn-print-orcamento" className="btn-print">Imprimir Orçamento</button>
      </div>

      <div className="doc">
        <div className="header">
          <img src="/logo.png" alt="MAGNA LOG" className="logo" />
          <div className="company">
            <div className="company-name">MAGNA LOG TRANSPORTES LTDA</div>
            <div className="doc-title">ORÇAMENTO</div>
          </div>
        </div>

        <div className="codigo">Nº {orc.codigo}</div>

        <div className="field"><b>Fornecedor:</b> {fornecedorLabel}</div>
        <div className="field"><b>Itens:</b> {orc.itens.length}</div>

        <div className="divisor" />

        <table className="itens">
          <thead>
            <tr>
              <th style={{ width: "12%" }}>Código</th>
              <th>Produto</th>
              <th className="cen" style={{ width: "8%" }}>Un</th>
              <th className="num" style={{ width: "15%" }}>Valor Un.</th>
              <th className="num" style={{ width: "9%" }}>Qtd</th>
              <th className="num" style={{ width: "16%" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {orc.itens.map((i) => (
              <tr key={i.id}>
                <td className="cod">{i.codigo}</td>
                <td>
                  {i.descricao}
                  {fornecedores.length > 1 && i.fornecedorNome && (
                    <div style={{ fontSize: 10, color: "#555" }}>{i.fornecedorNome}</div>
                  )}
                </td>
                <td className="cen"><b>{i.unidade || "—"}</b></td>
                <td className="num">{brl(i.valorUnitario)}</td>
                <td className="num">{qtdFmt(i.quantidade)}</td>
                <td className="num">{brl(i.valorTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="total">TOTAL: {brl(orc.valorTotal)}</div>

        <div className="nota-un">
          Valores por unidade de embalagem indicada na coluna &ldquo;Un&rdquo; (CX = caixa, FRD/FD = fardo),
          não por item avulso.
        </div>

        {orc.observacoes && <div className="obs"><b>OBS:</b> {orc.observacoes}</div>}

        <div className="footer-data">{dataStr}</div>

        <div className="emitido">Emitido por: {orc.criadoPor?.name || ""}</div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        const btn = document.getElementById("btn-print-orcamento");
        if (btn) btn.onclick = function() { window.print(); };
      ` }} />
    </>
  );
}
