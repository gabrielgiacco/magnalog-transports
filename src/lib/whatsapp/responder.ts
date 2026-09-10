// Ponto ÚNICO de saída do atendimento automático.
//
// Toda resposta do robô passa por aqui, e é aqui que a cota é conferida. Se
// algum dia existir um segundo caminho de envio automático, a cota deixa de
// valer — por isso este arquivo é o único que chama o provedor no fluxo de
// entrada.

import { prisma } from "@/lib/prisma";
import { getProvedor } from "@/lib/whatsapp";
import { consultarCota, competenciaAtual, getConfig } from "@/lib/whatsapp-cota";
import { podeResponder } from "./limites";

/**
 * Orçamento de tempo apertado: o provedor desiste da entrega do webhook em
 * ~10s e retenta. Melhor falhar o envio do que estourar e receber a mesma
 * mensagem três vezes.
 */
const TIMEOUT_ENVIO_MS = 6000;

export interface PedidoResposta {
  telefone: string;
  texto: string;
  /** Mensagem recebida que causou esta resposta. */
  recebidaId: string;
  /** Número reconhecido no cadastro? Muda o limite aplicado. */
  conhecido: boolean;
  entregaId?: string;
}

export interface ResultadoResposta {
  enviada: boolean;
  motivo?: string;
}

type Config = Awaited<ReturnType<typeof getConfig>>;

/**
 * Tudo que precisa estar certo ANTES de gastar uma mensagem. Devolve o motivo
 * da recusa, ou null quando pode seguir.
 */
async function travas(config: Config, pedido: PedidoResposta): Promise<string | null> {
  if (!config.ativo) return "integração de WhatsApp desligada";
  if (!config.atendimentoAtivo) return "atendimento automático desligado";

  // O robô para em limiteReserva (90), não em cotaMensal (100). A faixa de
  // reserva existe para um ADMIN empurrar um aviso importante à mão; robô não
  // come reserva.
  const cota = await consultarCota();
  if (cota.estado !== "ok") {
    return `cota ${cota.estado} (${cota.usadas}/${cota.cotaMensal}) — a reserva é do ADMIN`;
  }

  const veredito = await podeResponder(pedido.telefone, pedido.conhecido, config.maxRespostasDia);
  return veredito.permitido ? null : veredito.motivo ?? "limite atingido";
}

/**
 * Envia a resposta e registra em MensagemWhats.
 *
 * A resposta do robô é saída como qualquer outra e consome cota igual —
 * MensagemWhats continua sendo só saída, e é isso que mantém consultarCota()
 * correto sem alterar uma linha dele. O `recebidaId` só registra qual entrada
 * causou esta saída.
 */
export async function responder(pedido: PedidoResposta): Promise<ResultadoResposta> {
  const config = await getConfig();

  const impedimento = await travas(config, pedido);
  if (impedimento) return { enviada: false, motivo: impedimento };

  const corpo = pedido.texto.slice(0, config.maxCaracteres);

  let providerId: string | null = null;
  let erro: string | null = null;
  try {
    const r = await getProvedor().enviarTexto(pedido.telefone, corpo, TIMEOUT_ENVIO_MS);
    providerId = r.providerId;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  await prisma.mensagemWhats.create({
    data: {
      telefone: pedido.telefone,
      destinatario: "Atendimento automático",
      texto: corpo,
      status: erro ? "FALHOU" : "ENVIADA",
      erro,
      providerId,
      competencia: competenciaAtual(),
      // Sem enviadoPorId: não foi pessoa nenhuma que mandou.
      recebidaId: pedido.recebidaId,
      entregaId: pedido.entregaId ?? null,
    },
  });

  if (erro) {
    console.error(`[whatsapp] falha ao responder ${pedido.telefone}: ${erro}`);
    return { enviada: false, motivo: erro };
  }

  return { enviada: true };
}
