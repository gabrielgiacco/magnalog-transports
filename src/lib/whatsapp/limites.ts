// Limites de uso do atendimento automático.
//
// Contados no BANCO, não em memória, pelo mesmo motivo que está comentado em
// src/lib/login-rate-limit.ts: na Vercel cada requisição pode cair numa
// instância diferente, e um contador em memória protege exatamente nada.
//
// A regra que orienta os números: gravar é barato, responder é o que custa.
// Estourar um limite registra a mensagem e não devolve nada.

import { prisma } from "@/lib/prisma";
import { competenciaAtual } from "@/lib/whatsapp-cota";

/** Enxurrada de mensagens do mesmo número. */
const JANELA_TELEFONE_MIN = 10;
const MAX_POR_TELEFONE = 10;

/** Número que não é de ninguém cadastrado tem corda mais curta. */
const JANELA_DESCONHECIDO_MIN = 60;
const MAX_DESCONHECIDO = 3;

export interface Veredito {
  permitido: boolean;
  motivo?: string;
}

const OK: Veredito = { permitido: true };

/** Início do dia de hoje no fuso de Brasília, como instante UTC. */
function inicioDoDiaSP(): Date {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  // -03:00 é o fuso de Brasília o ano todo desde o fim do horário de verão.
  return new Date(`${hoje}T00:00:00-03:00`);
}

function minutosAtras(min: number): Date {
  return new Date(Date.now() - min * 60_000);
}

/**
 * Pode responder a esta mensagem?
 *
 * As contagens são sobre o que JÁ foi gravado, incluindo a mensagem atual —
 * o webhook grava antes de processar. Por isso os limites são "mais de N", e
 * não "N ou mais".
 */
export async function podeResponder(
  telefone: string,
  conhecido: boolean,
  maxRespostasDia: number
): Promise<Veredito> {
  if (!telefone) return { permitido: false, motivo: "sem telefone identificável" };

  const recebidasRecentes = await prisma.mensagemWhatsRecebida.count({
    where: { telefone, createdAt: { gte: minutosAtras(JANELA_TELEFONE_MIN) } },
  });
  if (recebidasRecentes > MAX_POR_TELEFONE) {
    return {
      permitido: false,
      motivo: `mais de ${MAX_POR_TELEFONE} mensagens deste número em ${JANELA_TELEFONE_MIN} min`,
    };
  }

  if (!conhecido) {
    const respostasDadas = await prisma.mensagemWhats.count({
      where: {
        status: "ENVIADA",
        createdAt: { gte: minutosAtras(JANELA_DESCONHECIDO_MIN) },
        recebida: { telefone },
      },
    });
    if (respostasDadas >= MAX_DESCONHECIDO) {
      return {
        permitido: false,
        motivo: `número não cadastrado já recebeu ${MAX_DESCONHECIDO} respostas na última hora`,
      };
    }
  }

  // Teto diário do robô, em cima do teto mensal. Um dia ruim não pode consumir
  // o mês inteiro.
  const respostasHoje = await prisma.mensagemWhats.count({
    where: {
      status: "ENVIADA",
      competencia: competenciaAtual(),
      createdAt: { gte: inicioDoDiaSP() },
      recebidaId: { not: null },
    },
  });
  if (respostasHoje >= maxRespostasDia) {
    return { permitido: false, motivo: `teto diário de ${maxRespostasDia} respostas atingido` };
  }

  return OK;
}
