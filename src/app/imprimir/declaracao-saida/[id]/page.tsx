import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

const formatCPF = (cpf: string | null | undefined) => {
  if (!cpf) return "";
  const s = String(cpf).replace(/\D/g, "");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return cpf;
};

const monthPtBr = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SECOES = [
  { origem: "AVARIA", titulo: "AVARIAS / REGISTROS" },
  { origem: "DEVOLUCAO", titulo: "NOTAS DE DEVOLUÇÃO" },
  { origem: "OCORRENCIA", titulo: "OCORRÊNCIAS" },
] as const;

export default async function DeclaracaoSaidaPage({ params }: { params: { id: string } }) {
  const decl = await prisma.declaracaoSaida.findUnique({
    where: { id: params.id },
    include: {
      emitidoPor: { select: { name: true } },
      itens: { orderBy: { referencia: "asc" } },
    },
  });

  if (!decl) return notFound();

  const dataDoc = decl.createdAt || new Date();
  const dataStr = `Aparecida de Goiânia, ${dataDoc.getDate()} de ${monthPtBr(dataDoc)} de ${dataDoc.getFullYear()}`;

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
        .codigo { text-align: right; font-weight: bold; font-size: 12px; margin-bottom: 6px; }
        .intro { text-align: justify; margin: 14px 0 18px; }
        .field { margin-bottom: 3px; }
        .field b { font-weight: bold; }
        .divisor { border-top: 1px dashed #666; margin: 12px 0; }
        .secao { margin: 14px 0 6px; font-weight: bold; text-decoration: underline; }
        table.itens { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        table.itens th { text-align: left; border-bottom: 1px solid #000; padding: 3px 4px; font-size: 11px; }
        table.itens td { padding: 3px 4px; vertical-align: top; border-bottom: 1px dotted #bbb; }
        .num { text-align: right; white-space: nowrap; }
        .total { margin-top: 14px; text-align: right; font-weight: bold; font-size: 13px; border-top: 1px solid #000; padding-top: 6px; }
        .obs { margin-top: 14px; }
        .footer-data { text-align: center; margin: 40px 0 60px; font-style: italic; }
        .assinaturas { display: flex; justify-content: space-between; gap: 40px; margin-top: 40px; }
        .ass-col { flex: 1; text-align: center; }
        .ass-line { border-top: 1px solid #000; padding-top: 4px; font-style: italic; font-size: 11px; }
        .emitido { margin-top: 40px; font-weight: bold; }

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
          .assinaturas { display: flex !important; }
        }
      ` }} />

      <div className="no-print btn-print-wrap">
        <button id="btn-print-declaracao" className="btn-print">Imprimir Declaração</button>
      </div>

      <div className="doc">
        <div className="header">
          <img src="/logo.png" alt="MAGNA LOG" className="logo" />
          <div className="company">
            <div className="company-name">MAGNA LOG TRANSPORTES LTDA</div>
            <div className="doc-title">DECLARAÇÃO DE SAÍDA</div>
          </div>
        </div>

        <div className="codigo">Nº {decl.codigo}</div>

        <p className="intro">
          Declaramos que as mercadorias e documentos relacionados abaixo foram retirados de nosso
          depósito nesta data, sob responsabilidade do motorista e da transportadora identificados,
          que conferiram e receberam os itens nas condições descritas.
        </p>

        <div className="field"><b>Transportadora:</b> {decl.transportadora}</div>
        <div className="field"><b>Motorista:</b> {decl.motoristaNome}</div>
        {decl.motoristaCpf && <div className="field"><b>CPF:</b> {formatCPF(decl.motoristaCpf)}</div>}
        <div className="field"><b>Placa:</b> {decl.placa}</div>

        <div className="divisor" />

        {SECOES.map(({ origem, titulo }) => {
          const itens = decl.itens.filter((i) => i.origem === origem);
          if (itens.length === 0) return null;
          const mostraValor = origem !== "OCORRENCIA";
          return (
            <div key={origem}>
              <div className="secao">{titulo}</div>
              <table className="itens">
                <thead>
                  <tr>
                    <th style={{ width: "18%" }}>Referência</th>
                    <th>Descrição</th>
                    {origem === "AVARIA" && <th className="num" style={{ width: "10%" }}>Qtd</th>}
                    {mostraValor && <th className="num" style={{ width: "16%" }}>Valor</th>}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.id}>
                      <td><b>{i.referencia}</b></td>
                      <td>{i.descricao}</td>
                      {origem === "AVARIA" && (
                        <td className="num">
                          {i.quantidade == null ? "—" : i.quantidade % 1 === 0 ? i.quantidade : i.quantidade.toFixed(2)}
                        </td>
                      )}
                      {mostraValor && <td className="num">{brl(i.valor)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        <div className="total">TOTAL GERAL: {brl(decl.valorTotal)}</div>

        {decl.observacoes && (
          <div className="obs"><b>OBS:</b> {decl.observacoes}</div>
        )}

        <div className="footer-data">{dataStr}</div>

        <div className="assinaturas">
          <div className="ass-col">
            <div className="ass-line">Assinatura Motorista</div>
          </div>
          <div className="ass-col">
            <div className="ass-line">Assinatura Responsável Magna Log</div>
          </div>
        </div>

        <div className="emitido">Emitido por: {decl.emitidoPor?.name || ""}</div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        const btn = document.getElementById("btn-print-declaracao");
        if (btn) btn.onclick = function() { window.print(); };
      ` }} />
    </>
  );
}
