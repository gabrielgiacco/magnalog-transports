// Renderização das tabelas da Solicitação de Ticket.
//
// Módulo PURO: sem React, sem prisma, sem DOM. É importado tanto pela rota de
// API (Node) quanto pelo modal (browser) — é isso que garante que o que você
// copia e o que sai no .eml são exatamente o mesmo documento.
//
// Regra de ouro do HTML aqui: o Outlook renderiza e-mail com o motor do Word.
// Só sobrevive estilo INLINE em tabela. Nada de <style>, classe CSS, variável
// CSS, flex, grid, position, border-radius ou unidade rem/em. Fonte em pt.

import type { DescargaBreakdown } from "./ticket-calc";

const NAVY = "#1f3864";
const VERMELHO = "#c00000";
const FONTE = "Calibri,Arial,sans-serif";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numeroBr(n: number): string {
  return (Number(n) || 0)
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Formato da memória de cálculo da descarga: "R$ 420,00".
export function moeda(n: number): string {
  return `R$ ${numeroBr(n)}`;
}

// Formato da linha "VALOR - R$" do ticket: "R$468,00", sem espaço — é como
// sai da planilha que o cliente já recebe hoje.
export function moedaTicket(n: number): string {
  return `R$${numeroBr(n)}`;
}

function pct(n: number): string {
  return `${(Number(n) || 0).toFixed(2).replace(".", ",")}%`;
}

export type TicketLinha = {
  dataSolicitacao: string;
  transportador: string;
  cliente: string;
  localidade: string;
  notasFiscais: string;
  dataAgenda: string;
  cte: string;
  perfilVeiculo: string;
  placaVeiculo: string;
  volumes: string;
  tipoSolicitacao: string;
  valor: string;
  observacoes: string;
};

export type TicketBloco = { linha: TicketLinha; descarga?: DescargaBreakdown };

// As 13 linhas em um só lugar. `vermelho` reproduz o destaque da planilha.
const ROWS: { label: string; key: keyof TicketLinha; vermelho: boolean }[] = [
  { label: "DATA SOLICITAÇÃO", key: "dataSolicitacao", vermelho: false },
  { label: "TRANSPORTADOR", key: "transportador", vermelho: false },
  { label: "CLIENTE", key: "cliente", vermelho: true },
  { label: "LOCALIDADE", key: "localidade", vermelho: true },
  { label: "NOTAS FISCAIS", key: "notasFiscais", vermelho: true },
  { label: "DATA AGENDA", key: "dataAgenda", vermelho: false },
  { label: "Nº CTE", key: "cte", vermelho: false },
  { label: "PERFIL DO VEÍCULO", key: "perfilVeiculo", vermelho: false },
  { label: "PLACA DO VEÍCULO", key: "placaVeiculo", vermelho: false },
  { label: "VOLUMES", key: "volumes", vermelho: false },
  { label: "TIPO SOLICITAÇÃO", key: "tipoSolicitacao", vermelho: true },
  { label: "VALOR - R$", key: "valor", vermelho: true },
  { label: "OBSERVAÇÕES", key: "observacoes", vermelho: false },
];

const TD_LABEL = `background-color:${NAVY};color:#ffffff;font-weight:bold;text-align:right;padding:4px 8px;border:1px solid ${NAVY};width:190px;`;
// height fixa: as células vazias (CTE, placa) precisam ficar REALMENTE vazias
// para colar no Excel como célula em branco — nada de &nbsp; para segurar altura.
const TD_VALOR_BASE = `padding:4px 8px;border:1px solid ${NAVY};text-align:center;width:320px;height:19px;`;

export function renderTicketTable(l: TicketLinha): string {
  const linhas = ROWS.map((r) => {
    const cor = r.vermelho ? `color:${VERMELHO};font-weight:bold;` : "color:#000000;";
    return (
      `<tr>` +
      `<td style="${TD_LABEL}">${esc(r.label)}</td>` +
      `<td style="${TD_VALOR_BASE}${cor}">${esc(l[r.key])}</td>` +
      `</tr>`
    );
  }).join("");

  return (
    `<table cellpadding="0" cellspacing="0" border="1" ` +
    `style="border-collapse:collapse;border:1px solid ${NAVY};font-family:${FONTE};font-size:10pt;">` +
    `<tr><td colspan="2" style="background-color:${NAVY};color:#ffffff;font-weight:bold;text-align:center;padding:5px 8px;border:1px solid ${NAVY};">` +
    `SOLICITAÇÃO APROVAÇÃO DE TICKET</td></tr>` +
    linhas +
    `</table>`
  );
}

export function renderDescargaMagnaTable(b: DescargaBreakdown): string {
  const rot = `padding:3px 8px;border:1px solid ${NAVY};font-weight:bold;color:#000000;width:150px;`;
  const num = `padding:3px 8px;border:1px solid ${NAVY};text-align:right;color:#000000;width:110px;`;

  const linha = (rotulo: string, aliquota: string, valor: number, negrito = false) =>
    `<tr>` +
    `<td style="${rot}">${esc(rotulo)}</td>` +
    `<td style="${num}">${esc(aliquota)}</td>` +
    `<td style="${num}${negrito ? `font-weight:bold;color:${VERMELHO};` : ""}">${esc(moeda(valor))}</td>` +
    `</tr>`;

  return (
    `<table cellpadding="0" cellspacing="0" border="1" ` +
    `style="border-collapse:collapse;border:1px solid ${NAVY};font-family:${FONTE};font-size:9pt;">` +
    `<tr><td colspan="3" style="background-color:${NAVY};color:#ffffff;font-weight:bold;text-align:center;padding:4px 8px;border:1px solid ${NAVY};">` +
    `Descarga Magna</td></tr>` +
    linha("Valor Descarga", "", b.base) +
    linha("IRPJ", pct(b.aliquotas.irpj), b.irpj) +
    linha("CSLL", pct(b.aliquotas.csll), b.csll) +
    linha("COFINS", pct(b.aliquotas.cofins), b.cofins) +
    linha("PIS", pct(b.aliquotas.pis), b.pis) +
    linha("ISS", pct(b.aliquotas.iss), b.iss) +
    linha("Total a Pagar", "-", b.total, true) +
    `</table>`
  );
}

// Fragmento — é o que vai para a área de transferência.
export function renderTicketTablesHtml(blocos: TicketBloco[]): string {
  return blocos
    .map((b) => renderTicketTable(b.linha) + (b.descarga ? "<br>" + renderDescargaMagnaTable(b.descarga) : ""))
    .join("<br><br>");
}

// Documento completo — é o que vai para dentro do .eml.
export function renderTicketEmailHtml(blocos: TicketBloco[], o?: { intro?: string; assinatura?: string }): string {
  const bloco = (txt?: string) =>
    txt ? `<div style="margin-bottom:12px;">${esc(txt).replace(/\n/g, "<br>")}</div>` : "";
  return (
    `<html><head><meta charset="utf-8"></head>` +
    `<body style="font-family:${FONTE};font-size:10pt;color:#000000;">` +
    bloco(o?.intro) +
    renderTicketTablesHtml(blocos) +
    (o?.assinatura ? `<br><br>${bloco(o.assinatura)}` : "") +
    `</body></html>`
  );
}

// Fallback separado por TAB — cola tanto em Excel quanto em e-mail texto puro.
export function renderTicketTablesTexto(blocos: TicketBloco[]): string {
  return blocos
    .map((b) => {
      const linhas = ["SOLICITAÇÃO APROVAÇÃO DE TICKET"];
      for (const r of ROWS) linhas.push(`${r.label}\t${b.linha[r.key] ?? ""}`);
      if (b.descarga) {
        const d = b.descarga;
        linhas.push("", "Descarga Magna");
        linhas.push(`Valor Descarga\t\t${moeda(d.base)}`);
        linhas.push(`IRPJ\t${pct(d.aliquotas.irpj)}\t${moeda(d.irpj)}`);
        linhas.push(`CSLL\t${pct(d.aliquotas.csll)}\t${moeda(d.csll)}`);
        linhas.push(`COFINS\t${pct(d.aliquotas.cofins)}\t${moeda(d.cofins)}`);
        linhas.push(`PIS\t${pct(d.aliquotas.pis)}\t${moeda(d.pis)}`);
        linhas.push(`ISS\t${pct(d.aliquotas.iss)}\t${moeda(d.iss)}`);
        linhas.push(`Total a Pagar\t-\t${moeda(d.total)}`);
      }
      return linhas.join("\n");
    })
    .join("\n\n");
}
