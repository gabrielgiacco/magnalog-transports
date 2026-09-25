// Vocabulário compartilhado da tela de Depósito: rótulos, cores e
// formatadores usados por page.tsx, DepositoTabela.tsx e os modais do
// módulo (BaixaModal, EntradaManualModal, CandidatosModal). Constantes
// puras — sem Prisma, sem JSX.

import { LIMITE_ATENCAO, LIMITE_CRITICO } from "@/lib/deposito";

export { LIMITE_ATENCAO, LIMITE_CRITICO };

export interface OpcaoTipoEntrada {
  value: string;
  label: string;
  cor: string;
}

// TipoEntradaDeposito (prisma/schema.prisma), na ordem em que aparecem nos
// seletores.
export const TIPOS_ENTRADA: OpcaoTipoEntrada[] = [
  { value: "DEVOLUCAO_TOTAL", label: "Devolução total", cor: "#f87171" },
  { value: "DEVOLUCAO_PARCIAL", label: "Devolução parcial", cor: "#fb923c" },
  { value: "SOBRA", label: "Sobra", cor: "#fbbf24" },
  { value: "AVARIA", label: "Avaria", cor: "#a78bfa" },
  { value: "ARMAZENAGEM", label: "Armazenagem", cor: "#38bdf8" },
];

export interface OpcaoMotivoBaixa {
  value: string;
  label: string;
  hint: string;
}

// MotivoBaixaDeposito (prisma/schema.prisma).
export const MOTIVOS_BAIXA: OpcaoMotivoBaixa[] = [
  { value: "REEXPEDIDO", label: "Reexpedido", hint: "nova tentativa de entrega" },
  { value: "DEVOLVIDO_EMBARCADOR", label: "Devolvido ao embarcador", hint: "voltou para quem contratou o frete" },
  { value: "RETIRADO_EMBARCADOR", label: "Retirado pelo embarcador", hint: "buscaram aqui no depósito" },
  { value: "DESCARTE", label: "Descartado", hint: "perda ou destruição" },
];

/** Verde abaixo de LIMITE_ATENCAO, âmbar até LIMITE_CRITICO, vermelho dali pra cima. */
export function corDias(dias: number): string {
  if (dias >= LIMITE_CRITICO) return "#f87171";
  if (dias >= LIMITE_ATENCAO) return "#fbbf24";
  return "#34d399";
}

export function labelTipo(v: string): string {
  return TIPOS_ENTRADA.find((t) => t.value === v)?.label ?? v;
}

export function labelMotivo(v: string | null | undefined): string {
  if (!v) return "—";
  return MOTIVOS_BAIXA.find((m) => m.value === v)?.label ?? v;
}

export function fmtKg(kg: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(kg ?? 0)} kg`;
}

export function fmtBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor ?? 0);
}

export function fmtData(data: string | Date | null | undefined): string {
  if (!data) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(data));
}
