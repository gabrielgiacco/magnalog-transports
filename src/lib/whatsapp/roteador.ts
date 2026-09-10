// O que a mensagem quer.
//
// Determinístico de propósito: as entradas aqui são estruturadas — número de
// nota, chave de 44 dígitos, um punhado de palavras. Regex resolve, custa
// zero, nunca inventa e não adiciona dependência de IA a um sistema que não
// tem nenhuma.

import type { MensagemEntrada } from "./provider";

export type Intencao =
  | { tipo: "LOCALIZACAO_MOTORISTA" }
  | { tipo: "STATUS_NF"; termo: string; porChave: boolean }
  | { tipo: "ENDERECO_EMPRESA" }
  | { tipo: "MENU" }
  | { tipo: "NAO_ENTENDIDA" };

/** Minúsculas, sem acento, espaços colapsados. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const RE_SAUDACAO = /^(menu|oi|ola|opa|bom dia|boa tarde|boa noite|ajuda|\?|0)$/;

/**
 * Endereço da transportadora.
 *
 * Ancorado em "onde fica" e "onde voces", NUNCA em "onde" solto: "onde está
 * minha carga" é pergunta de rastreio e cairia aqui, respondendo o endereço do
 * galpão para quem quer saber da entrega.
 */
const RE_ENDERECO =
  /\b(endereco|onde (fica|voces|vcs|e a|estao)|como chegar|localizacao de voces|galpao|deposito|armazem|cep de voces)\b/;

/** Chave de acesso da NFe: 44 dígitos. */
const RE_CHAVE = /\b(\d{44})\b/;

/** Número de nota, com ou sem os rótulos que as pessoas escrevem na frente. */
const RE_NF = /\b(?:nf|nfe|nota(?: fiscal)?)?\s*n?[oº°]?\s*(\d{3,9})\b/;

/**
 * Primeira regra que casa vence, do mais específico para o mais genérico.
 */
export function classificar(msg: MensagemEntrada): Intencao {
  // Sinal estruturado: ambiguidade zero, vem antes de qualquer texto.
  if (msg.tipo === "LOCALIZACAO") return { tipo: "LOCALIZACAO_MOTORISTA" };

  const texto = normalizar(msg.texto || "");
  if (!texto) return { tipo: "NAO_ENTENDIDA" };

  // Chave é @unique em NotaFiscal: a busca mais barata e exata que existe.
  const chave = texto.replace(/\D/g, "").match(/^(\d{44})$/) || texto.match(RE_CHAVE);
  if (chave) return { tipo: "STATUS_NF", termo: chave[1], porChave: true };

  if (RE_SAUDACAO.test(texto)) return { tipo: "MENU" };
  if (RE_ENDERECO.test(texto)) return { tipo: "ENDERECO_EMPRESA" };

  const nf = texto.match(RE_NF);
  if (nf) return { tipo: "STATUS_NF", termo: nf[1], porChave: false };

  return { tipo: "NAO_ENTENDIDA" };
}
