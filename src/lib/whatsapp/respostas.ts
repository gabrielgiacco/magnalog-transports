// Textos das respostas. Funções puras: sem banco, sem rede, sem data de hoje
// escondida dentro — o que entra determina o que sai.
//
// Teto de 600 caracteres do plano gratuito é respeitado na origem, no
// responder.ts, mas estes textos já nascem curtos: WhatsApp não é e-mail.

import { DEPOSITO } from "@/lib/rota-trajeto";
import type { ResumoEntrega } from "@/lib/rastreio";

const STATUS_LEGIVEL: Record<string, string> = {
  PROGRAMADO: "Programado",
  EM_SEPARACAO: "Em separação",
  CARREGADO: "Carregado",
  EM_ROTA: "Em rota",
  ENTREGUE: "Entregue",
  FINALIZADO: "Entregue",
  OCORRENCIA: "Com ocorrência",
};

function data(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * Status da entrega.
 *
 * Termina com o link da página pública de propósito: é o melhor investimento
 * de caractere que existe. Uma mensagem paga leva a pessoa para uma página que
 * não custa nada, com linha do tempo e comprovante.
 */
export function respostaStatus(e: ResumoEntrega, baseUrl: string): string {
  const linhas: string[] = [];
  const rotulo = e.notas.length > 0 ? `NF ${e.notas.slice(0, 3).join(", ")}` : e.codigo;

  linhas.push(`*${rotulo}* — Magna Log`);
  linhas.push(`Status: ${STATUS_LEGIVEL[e.status] || e.status}`);

  if (e.status === "ENTREGUE" || e.status === "FINALIZADO") {
    const entregue = data(e.dataEntrega);
    if (entregue) linhas.push(`Entregue em: ${entregue}`);
  } else {
    const previsao = data(e.dataAgendada);
    if (previsao) linhas.push(`Previsão: ${previsao}`);
  }

  if (e.motorista) {
    linhas.push(`Motorista: ${e.motorista}${e.placa ? ` · ${e.placa}` : ""}`);
  }
  linhas.push(`Destino: ${e.destinatario} — ${e.cidade}${e.uf ? `/${e.uf}` : ""}`);

  // Ocorrência em aberto é o que a pessoa mais precisa saber; vem antes do link.
  if (e.ocorrencias.length > 0) {
    const o = e.ocorrencias[0];
    linhas.push("");
    linhas.push(`⚠️ ${o.tipo}: ${o.descricao.slice(0, 120)}`);
  }

  const termo = e.notas[0] || e.codigo;
  linhas.push("");
  linhas.push(`Acompanhe: ${baseUrl}/entrega/${encodeURIComponent(termo)}`);

  return linhas.join("\n");
}

/**
 * "Não encontrei" é a MESMA frase para nota inexistente e para nota de outro
 * embarcador. Distinguir as duas transformaria o bot num oráculo de quais
 * notas existem no sistema.
 */
export function respostaNaoEncontrada(termo: string): string {
  return (
    `Não encontrei a NF ${termo} nas entregas ligadas a este número.\n\n` +
    `Confira o número da nota, ou fale com a equipe se precisar de ajuda.`
  );
}

/** Endereço da empresa: zero consulta ao banco. */
export function respostaEndereco(): string {
  return (
    `*${DEPOSITO.nome}*\n` +
    `${DEPOSITO.endereco}\n` +
    `${DEPOSITO.cidade} — CEP ${DEPOSITO.cep}\n\n` +
    `Mapa: https://www.google.com/maps?q=${DEPOSITO.lat},${DEPOSITO.lng}`
  );
}

/** Menu, e também o texto de "não entendi" — é ele que a IA um dia substitui. */
export function respostaMenu(conhecido: boolean): string {
  const base =
    `Aqui é a *Magna Log*. Posso ajudar com:\n\n` +
    `• Envie o *número da nota fiscal* para ver o status da entrega\n` +
    `• Digite *endereço* para saber onde ficamos`;

  return conhecido
    ? base
    : `${base}\n\n_Para consultar entregas, seu número precisa estar cadastrado com a gente._`;
}

/** Quem não é reconhecido não recebe dado de entrega nenhum. */
export function respostaSemCadastro(): string {
  return (
    `Para consultar entregas por aqui, o número precisa estar cadastrado com a Magna Log.\n\n` +
    `Fale com a equipe para liberar o seu, ou digite *endereço* se precisar de onde ficamos.`
  );
}
