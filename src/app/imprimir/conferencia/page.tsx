import { prisma } from "@/lib/prisma";
import { agregarProdutosParaConferencia, carregarNormasPorDestinatario, LinhaConferencia } from "@/lib/nf-produtos";
import { notFound } from "next/navigation";

const formatCNPJ = (cnpj: string | null | undefined) => {
  if (!cnpj) return "";
  const s = cnpj.replace(/\D/g, "");
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return cnpj;
};

const paletesInfo = (quantidade: number, qtdCaixasPalete: number | undefined) => {
  if (!qtdCaixasPalete || qtdCaixasPalete <= 0) {
    return { fisicos: 0, inteiros: 0, sobras: 0, ponta: 0, detalhe: "—" };
  }
  const inteiros = Math.floor(quantidade / qtdCaixasPalete);
  const sobras = quantidade % qtdCaixasPalete;
  const ponta = sobras > 0 ? 1 : 0;
  const fisicos = inteiros + ponta;
  let detalhe = "";
  if (inteiros > 0 && ponta > 0) detalhe = `${inteiros} int. + 1 ponta (${sobras} cx)`;
  else if (inteiros > 0) detalhe = `${inteiros} int.`;
  else if (ponta > 0) detalhe = `1 ponta (${sobras} cx)`;
  return { fisicos, inteiros, sobras, ponta, detalhe };
};

type NotaLite = {
  id: string;
  numero: string;
  emitenteCnpj: string | null;
  emitenteRazao: string | null;
  destinatarioCnpj: string | null;
  destinatarioRazao: string | null;
  cidade: string | null;
  uf: string | null;
  xmlOriginal: string | null;
};

type Grupo = {
  destinatarioCnpj: string;
  destinatarioRazao: string;
  cidade: string;
  uf: string;
  notas: NotaLite[];
  linhas: LinhaConferencia[];
  totalCaixas: number;
  totalPaletes: number;
  notasSemXml: string[];
};

export default async function ConferenciaPage({ searchParams }: { searchParams: { nfIds?: string } }) {
  const raw = (searchParams?.nfIds || "").trim();
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return notFound();

  const notas = (await prisma.notaFiscal.findMany({
    where: { id: { in: ids } },
    orderBy: [{ destinatarioCnpj: "asc" }, { numero: "asc" }],
    select: {
      id: true, numero: true,
      emitenteCnpj: true, emitenteRazao: true,
      destinatarioCnpj: true, destinatarioRazao: true,
      cidade: true, uf: true,
      xmlOriginal: true,
    },
  })) as NotaLite[];

  if (notas.length === 0) return notFound();

  // Agrupa NFs por destinatário
  const gruposMap = new Map<string, Grupo>();
  for (const nf of notas) {
    const chave = String(nf.destinatarioCnpj || "").replace(/\D/g, "") || "SEM_CNPJ";
    let g = gruposMap.get(chave);
    if (!g) {
      g = {
        destinatarioCnpj: nf.destinatarioCnpj || "",
        destinatarioRazao: nf.destinatarioRazao || "(Destinatário não informado)",
        cidade: nf.cidade || "",
        uf: nf.uf || "",
        notas: [],
        linhas: [],
        totalCaixas: 0,
        totalPaletes: 0,
        notasSemXml: [],
      };
      gruposMap.set(chave, g);
    }
    g.notas.push(nf);
    if (!nf.xmlOriginal) g.notasSemXml.push(nf.numero);
  }

  // Para cada grupo, carrega normas e agrega
  let totalCaixasGeral = 0;
  let totalPaletesGeral = 0;

  const grupos: Grupo[] = Array.from(gruposMap.values());
  for (const grupo of grupos) {
    const fornecedoresCnpjs: string[] = Array.from(
      new Set(grupo.notas.map((n: NotaLite) => n.emitenteCnpj || "").filter((x: string) => !!x))
    );
    const normasMap = await carregarNormasPorDestinatario(grupo.destinatarioCnpj, fornecedoresCnpjs);
    grupo.linhas = agregarProdutosParaConferencia(grupo.notas, normasMap);
    grupo.totalCaixas = grupo.linhas.reduce((s: number, l: LinhaConferencia) => s + l.quantidade, 0);
    grupo.totalPaletes = grupo.linhas.reduce(
      (s: number, l: LinhaConferencia) => s + paletesInfo(l.quantidade, l.norma?.quantidadeCaixasPalete).fisicos,
      0,
    );
    totalCaixasGeral += grupo.totalCaixas;
    totalPaletesGeral += grupo.totalPaletes;
  }
  const totalNfs = notas.length;
  const totalDestinatarios = grupos.length;
  const dataGeracao = new Date().toLocaleString("pt-BR");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; color: #1e293b; padding: 20px; line-height: 1.4; margin: 0; background: #fff; }
        .header-container { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }
        .title-area h1 { font-size: 18px; margin: 0 0 5px 0; text-transform: uppercase; font-weight: 700; color: #0f172a; }
        .title-area p { font-size: 11px; color: #64748b; margin: 0; }
        .meta-carga { text-align: right; }
        .meta-carga h2 { font-size: 14px; margin: 0; font-weight: 700; color: #f97316; font-family: monospace; }
        .meta-carga p { font-size: 10px; color: #64748b; margin: 2px 0 0 0; text-transform: uppercase; }

        .kpis-print { display: flex; gap: 12px; margin-bottom: 20px; }
        .kpi-print-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center; background: #fff; }
        .kpi-print-val { font-size: 18px; font-weight: bold; color: #0f172a; }
        .kpi-print-lbl { font-size: 9px; text-transform: uppercase; color: #64748b; margin-top: 2px; }

        .grupo-secao { margin-top: 26px; page-break-inside: avoid; }
        .grupo-header { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; }
        .grupo-title { font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; margin: 0 0 4px 0; }
        .grupo-meta { font-size: 10px; color: #475569; display: flex; gap: 18px; flex-wrap: wrap; }
        .grupo-meta span b { color: #0f172a; }

        table { width: 100%; border-collapse: collapse; margin-top: 6px; margin-bottom: 10px; }
        th { background: #f1f5f9; font-size: 9px; text-transform: uppercase; font-weight: 700; color: #475569; padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; }
        td { font-size: 11px; padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155; }
        .font-mono { font-family: monospace; }
        .text-center { text-align: center; }

        .aviso-sem-xml { font-size: 10px; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 10px; margin-top: 4px; }

        .signature-area { display: flex; justify-content: space-between; margin-top: 60px; page-break-inside: avoid; }
        .signature-line { width: 45%; border-top: 1px solid #64748b; text-align: center; padding-top: 6px; font-size: 10px; font-weight: bold; color: #475569; }

        .btn-print-wrap { position: fixed; top: 12px; right: 12px; z-index: 999; }
        .btn-print { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
        .btn-print:hover { background: #1d4ed8; }

        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { padding: 0; }
          .no-print { display: none !important; }
        }
      ` }} />

      <div className="no-print btn-print-wrap">
        <button id="btn-print-conferencia" className="btn-print">Imprimir Ficha</button>
      </div>

      <div className="header-container">
        <div className="title-area">
          <h1>Ficha de Conferência & Paletização</h1>
          <p>Consolidação de múltiplas NFs — instruções físicas de empilhamento por norma do cliente</p>
        </div>
        <div className="meta-carga">
          <h2>Gerada em {dataGeracao}</h2>
          <p>Documento de conferência</p>
        </div>
      </div>

      <div className="kpis-print">
        <div className="kpi-print-box">
          <div className="kpi-print-val">{totalNfs}</div>
          <div className="kpi-print-lbl">Notas Fiscais</div>
        </div>
        <div className="kpi-print-box">
          <div className="kpi-print-val">{totalDestinatarios}</div>
          <div className="kpi-print-lbl">Destinatários</div>
        </div>
        <div className="kpi-print-box">
          <div className="kpi-print-val">{totalCaixasGeral}</div>
          <div className="kpi-print-lbl">Total Caixas</div>
        </div>
        <div className="kpi-print-box">
          <div className="kpi-print-val">{totalPaletesGeral}</div>
          <div className="kpi-print-lbl">Paletes (Físicos)</div>
        </div>
      </div>

      {grupos.map((g, idx) => (
        <section key={idx} className="grupo-secao">
          <div className="grupo-header">
            <h3 className="grupo-title">{g.destinatarioRazao}</h3>
            <div className="grupo-meta">
              <span><b>CNPJ:</b> {formatCNPJ(g.destinatarioCnpj)}</span>
              <span><b>Cidade/UF:</b> {g.cidade}{g.uf ? ` — ${g.uf}` : ""}</span>
              <span><b>NFs:</b> {g.notas.map((n) => n.numero).join(", ")}</span>
              <span><b>Caixas:</b> {g.totalCaixas}</span>
              <span><b>Paletes:</b> {g.totalPaletes}</span>
            </div>
          </div>

          {g.linhas.length === 0 ? (
            <div className="aviso-sem-xml">
              Produtos indisponíveis para as NFs deste destinatário (XML não armazenado).
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>NF</th>
                    <th style={{ width: 90 }}>Cód Produto</th>
                    <th>Descrição do Produto</th>
                    <th style={{ width: 60, textAlign: "center" }}>Qtd Caixas</th>
                    <th style={{ width: 110, textAlign: "center" }}>Norma (L×A)</th>
                    <th style={{ width: 110, textAlign: "center" }}>Paletes Estimados</th>
                    <th style={{ width: 110 }}>Conf. Paletes</th>
                    <th style={{ width: 120 }}>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {g.linhas.map((linha, i) => {
                    const normaText = linha.norma
                      ? `${linha.norma.lastro} x ${linha.norma.altura} = ${linha.norma.quantidadeCaixasPalete}`
                      : "SEM NORMA";
                    const info = linha.norma
                      ? paletesInfo(linha.quantidade, linha.norma.quantidadeCaixasPalete)
                      : null;
                    return (
                      <tr key={i}>
                        <td className="font-mono text-center">{linha.nfNumeros.join(", ")}</td>
                        <td className="font-mono text-center">{linha.codigo}</td>
                        <td>{linha.descricao || "—"}</td>
                        <td className="text-center font-mono">{linha.quantidade}</td>
                        <td className="text-center font-mono">{normaText}</td>
                        <td className="text-center font-mono">
                          {info ? (
                            <>
                              <div style={{ fontWeight: "bold" }}>{info.fisicos} palete{info.fisicos !== 1 ? "s" : ""}</div>
                              <div style={{ fontSize: 9, color: "#64748b" }}>{info.detalhe}</div>
                            </>
                          ) : "—"}
                        </td>
                        <td></td>
                        <td></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {g.notasSemXml.length > 0 && (
                <div className="aviso-sem-xml">
                  Atenção: NF {g.notasSemXml.join(", ")} sem XML armazenado — produtos não incluídos.
                </div>
              )}
            </>
          )}
        </section>
      ))}

      <div className="signature-area">
        <div className="signature-line">Assinatura do Conferente (Pátio)</div>
        <div className="signature-line">Assinatura do Motorista</div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        const btn = document.getElementById("btn-print-conferencia");
        if (btn) btn.onclick = function() { window.print(); };
      ` }} />
    </>
  );
}
