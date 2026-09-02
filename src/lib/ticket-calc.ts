// Cálculos da Solicitação de Aprovação de Ticket.
//
// Módulo PURO de propósito: nada aqui pode importar prisma. O modal recalcula
// os impostos da descarga ao vivo enquanto o usuário edita o valor base, então
// estas funções precisam rodar no browser.

export type TipoTicket = "PALETIZACAO" | "DESCARGA" | "DIARIA" | "REENTREGA" | "ARMAZENAGEM";

export const TIPOS_TICKET: TipoTicket[] = ["PALETIZACAO", "DESCARGA", "DIARIA", "REENTREGA", "ARMAZENAGEM"];

// Rótulos como aparecem na planilha do cliente (DIARIA sem acento, de propósito).
export const TIPO_TICKET_LABELS: Record<TipoTicket, string> = {
  PALETIZACAO: "PALETIZAÇÃO",
  DESCARGA: "DESCARGA",
  DIARIA: "DIARIA",
  REENTREGA: "REENTREGA",
  ARMAZENAGEM: "ARMAZENAGEM",
};

export type Aliquotas = { irpj: number; csll: number; cofins: number; pis: number; iss: number };

export const ALIQUOTAS_PADRAO: Aliquotas = { irpj: 8, csll: 12, cofins: 7.6, pis: 1.65, iss: 3 };

export function round2(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ─── Descarga ────────────────────────────────────────────────────────────
// Cada imposto é arredondado em 2 casas ISOLADAMENTE e depois somado ao valor
// base. Não trocar por `round2(base * 1.3225)`: o resultado diverge em bases
// com dízima, e a regra acordada é o arredondamento linha a linha.

export type DescargaBreakdown = {
  base: number;
  irpj: number;
  csll: number;
  cofins: number;
  pis: number;
  iss: number;
  total: number;
  aliquotas: Aliquotas;
};

export function calcularDescargaTicket(base: number, aliquotas: Aliquotas = ALIQUOTAS_PADRAO): DescargaBreakdown {
  const b = round2(base);
  const irpj = round2((b * aliquotas.irpj) / 100);
  const csll = round2((b * aliquotas.csll) / 100);
  const cofins = round2((b * aliquotas.cofins) / 100);
  const pis = round2((b * aliquotas.pis) / 100);
  const iss = round2((b * aliquotas.iss) / 100);
  return {
    base: b,
    irpj,
    csll,
    cofins,
    pis,
    iss,
    total: round2(b + irpj + csll + cofins + pis + iss),
    aliquotas,
  };
}

// ─── Paletização ─────────────────────────────────────────────────────────

export function calcularPaletizacao(qtdPaletes: number, valorPalete: number) {
  const qtd = Math.max(0, Math.trunc(Number(qtdPaletes) || 0));
  return {
    valor: round2(qtd * (Number(valorPalete) || 0)),
    observacoes: `${qtd} PALETIZAÇÃO`,
    semTabela: !valorPalete,
  };
}

// ─── Diária ──────────────────────────────────────────────────────────────

export type DiariasTabela = {
  diariaVuc: number;
  diariaTresQuartos: number;
  diariaToco: number;
  diariaTruck: number;
  diariaCarreta: number;
  diariaBitruck: number;
  diariaUtilitario: number;
};

export const CAMPO_DIARIA_POR_VEICULO: Record<string, keyof DiariasTabela> = {
  VUC: "diariaVuc",
  TRES_QUARTOS: "diariaTresQuartos",
  TOCO: "diariaToco",
  TRUCK: "diariaTruck",
  CARRETA: "diariaCarreta",
  BITRUCK: "diariaBitruck",
  UTILITARIO: "diariaUtilitario",
};

export function calcularDiaria(tipoVeiculo: string | null | undefined, tabela: Partial<DiariasTabela>) {
  const campo = tipoVeiculo ? CAMPO_DIARIA_POR_VEICULO[tipoVeiculo] : undefined;
  const valor = campo ? Number(tabela?.[campo]) || 0 : 0;
  return {
    valor: round2(valor),
    observacoes: "DIARIA",
    // Sinaliza para a tela avisar em vez de emitir R$ 0,00 caladamente.
    semTabela: !campo || valor <= 0,
  };
}

// ─── Reentrega ───────────────────────────────────────────────────────────

export function calcularReentrega(valorEntrega: number, percentual: number) {
  const pct = Number(percentual) || 0;
  return {
    valor: round2(((Number(valorEntrega) || 0) * pct) / 100),
    observacoes: `REENTREGA ${pct}% DO VALOR DA ENTREGA`,
    semTabela: pct <= 0,
  };
}

// ─── Armazenagem ─────────────────────────────────────────────────────────
// Mesma fórmula já usada no resto do sistema: (dias - diasFree) x paletes x valor/dia.
// Existe aqui em versão pura para o modal recalcular quando o usuário edita
// dias ou paletes; a fonte de verdade continua sendo o cálculo do servidor.

export function calcularArmazenagemTicket(i: {
  dias: number;
  diasFree: number;
  valorPaleteDia: number;
  paletes: number;
}) {
  const diasCobraveis = Math.max(0, (Number(i.dias) || 0) - (Number(i.diasFree) || 0));
  const paletes = Math.max(0, Math.trunc(Number(i.paletes) || 0));
  return {
    valor: round2(diasCobraveis * (Number(i.valorPaleteDia) || 0) * paletes),
    diasCobraveis,
    observacoes: `${diasCobraveis} DIA(S) x ${paletes} PALETE(S)`,
    semTabela: !i.valorPaleteDia,
  };
}
