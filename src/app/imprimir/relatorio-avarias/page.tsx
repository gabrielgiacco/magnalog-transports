import { requireSessaoImpressao } from "@/lib/imprimir-auth";
import { buscarLinhasRelatorio, lerFiltros, resumirLinhas } from "@/lib/avarias-relatorio";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number | null) =>
  v === null ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
// dataOcorrencia fica guardada em meia-noite UTC
const dataBR = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
const isoParaBR = (iso: string) => iso.split("-").reverse().join("/");

export default async function RelatorioAvariasPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSessaoImpressao();

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    const valor = Array.isArray(v) ? v[0] : v;
    if (valor !== undefined) sp.set(k, valor);
  }
  const filtros = lerFiltros(sp);
  const linhas = await buscarLinhasRelatorio(filtros);
  const resumo = resumirLinhas(linhas);

  const soFalta = filtros.tipos.length === 1 && filtros.tipos[0] === "FALTA";
  const soAvaria = filtros.tipos.length === 1 && filtros.tipos[0] === "AVARIA";
  const titulo = soFalta ? "RELATÓRIO DE FALTAS" : soAvaria ? "RELATÓRIO DE AVARIAS" : "RELATÓRIO DE AVARIAS E FALTAS";

  const embarcador = !filtros.embarcador ? "Todos" : linhas[0]?.embarcador || "—";
  const { de, ate } = filtros;
  const periodo =
    de && ate ? `${isoParaBR(de)} a ${isoParaBR(ate)}`
    : de ? `a partir de ${isoParaBR(de)}`
    : ate ? `até ${isoParaBR(ate)}`
    : "todo o histórico";
  const emitidoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const totalQtd = linhas.reduce((s, l) => s + (l.qtdDivergencia || 0), 0);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        body { font-family: Arial, Helvetica, sans-serif; color: #000; padding: 20px 24px; margin: 0; background: #fff; font-size: 10px; line-height: 1.35; }
        .doc { margin: 0 auto; }
        .header { display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
        .logo { width: 110px; height: auto; }
        .company { flex: 1; text-align: center; }
        .company-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; }
        .doc-title { font-weight: bold; font-size: 12px; }
        .meta { display: flex; flex-wrap: wrap; gap: 4px 24px; font-size: 11px; margin-bottom: 8px; }
        .resumo { display: flex; flex-wrap: wrap; gap: 4px 24px; border: 1px solid #000; padding: 6px 10px; margin-bottom: 10px; font-size: 11px; }
        .vazio { text-align: center; margin: 60px 0; font-size: 13px; color: #444; }
        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th { background: #e5e7eb; border: 1px solid #666; padding: 3px 4px; text-align: left; font-size: 9.5px; }
        td { border-left: 1px solid #999; border-right: 1px solid #999; border-bottom: 1px solid #ddd; padding: 3px 4px; vertical-align: top; word-wrap: break-word; }
        tr.grupo td { border-top: 2px solid #000; }
        .r { text-align: right; white-space: nowrap; }
        .nw { white-space: nowrap; }
        tfoot td { border: 1px solid #666; border-top: 2px solid #000; font-weight: bold; background: #f3f4f6; }

        .btn-print-wrap { position: fixed; top: 12px; right: 12px; z-index: 999; }
        .btn-print { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.15); font-family: Arial, sans-serif; }
        .btn-print:hover { background: #1d4ed8; }

        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { padding: 0; }
          .no-print { display: none !important; }
          /* Reafirma os layouts em linha (regras globais de impressao ja
             forcaram display:block e empilharam o cabecalho). */
          .header { display: flex !important; }
          .meta, .resumo { display: flex !important; }
          thead { display: table-header-group !important; }
          /* Total so no fim: como table-footer-group ele se repetiria em cada
             pagina e pareceria subtotal da pagina. */
          tfoot { display: table-row-group !important; }
        }
      ` }} />

      <div className="no-print btn-print-wrap">
        <button id="btn-print-relatorio" className="btn-print">Imprimir / Salvar PDF</button>
      </div>

      <div className="doc">
        <div className="header">
          <img src="/logo.png" alt="MAGNA LOG" className="logo" />
          <div className="company">
            <div className="company-name">MAGNA LOG TRANSPORTES LTDA</div>
            <div className="doc-title">{titulo}</div>
          </div>
        </div>

        <div className="meta">
          <span><b>Embarcador:</b> {embarcador}</span>
          <span><b>Período:</b> {periodo}</span>
          <span><b>Emitido em:</b> {emitidoEm}</span>
        </div>

        <div className="resumo">
          <span><b>Registros:</b> {resumo.registros}</span>
          {resumo.porTipo.map((t) => (
            <span key={t.tipo}>
              <b>{t.tipo}:</b> {t.linhas} {t.linhas === 1 ? "linha" : "linhas"}, {num(t.quantidade)} unid., {brl(t.valor)}
            </span>
          ))}
          <span><b>Valor total:</b> {brl(resumo.valorTotal)}</span>
        </div>

        {linhas.length === 0 ? (
          <div className="vazio">Nenhum registro de avaria/falta no período selecionado.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Data</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>NF</th>
                <th>Destinatário</th>
                <th>Cód.</th>
                <th>Produto</th>
                <th>Un.</th>
                <th className="r">Qtd. NF</th>
                <th className="r">Qtd. div.</th>
                <th className="r">Valor</th>
                <th>Transportadora/Placa</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const primeira = i === 0 || linhas[i - 1].codigo !== l.codigo;
                const transp = [l.transportadora, l.placa].filter(Boolean).join(" / ");
                return (
                  <tr key={i} className={primeira ? "grupo" : undefined}>
                    <td className="nw">{primeira ? l.codigo : ""}</td>
                    <td className="nw">{primeira ? dataBR(l.data) : ""}</td>
                    <td>{l.tipo}</td>
                    <td>{primeira ? l.status : ""}</td>
                    <td className="nw">{l.nf}</td>
                    <td>{l.destinatario}</td>
                    <td className="nw">{l.codigoProduto}</td>
                    <td>{l.produto}</td>
                    <td>{l.unidade}</td>
                    <td className="r">{num(l.qtdNF)}</td>
                    <td className="r">{num(l.qtdDivergencia)}</td>
                    <td className="r">{brl(l.valor)}</td>
                    <td>{primeira ? transp : ""}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={10}>Total</td>
                <td className="r">{num(totalQtd)}</td>
                <td className="r">{brl(resumo.valorTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        const btn = document.getElementById("btn-print-relatorio");
        if (btn) btn.onclick = function() { window.print(); };
      ` }} />
    </>
  );
}
