// Orquestração do atendimento: identidade → intenção → autorização → resposta.
//
// Não envia nada. Devolve o texto que DEVERIA sair e o motivo quando não sai —
// quem envia (e quem gasta cota) é o responder.ts. Essa separação é o que
// permite o simulador rodar o pipeline inteiro sem custar uma mensagem.

import { resolverIdentidade, type Identidade } from "./identidade";
import { classificar, type Intencao } from "./roteador";
import { buscarParaBot } from "@/lib/rastreio";
import {
  respostaEndereco,
  respostaMenu,
  respostaNaoEncontrada,
  respostaSemCadastro,
  respostaStatus,
} from "./respostas";
import type { MensagemEntrada } from "./provider";

export interface Atendimento {
  identidade: Identidade;
  intencao: Intencao;
  /** Texto a enviar, ou null quando não se responde nada. */
  resposta: string | null;
  /** Preenchido quando resposta é null. */
  motivoSemResposta?: string;
  /** Entrega encontrada, para registro. */
  entregaId?: string;
}

/**
 * AQUI ENTRA A IA, quando entrar. Hoje devolve null e o cliente recebe o menu.
 *
 * O contrato que torna esse ponto seguro: a IA devolve a MESMA `Intencao` que
 * o roteador devolveria. Ela só classifica — nunca fala com o cliente, nunca
 * toca o banco, nunca decide autorização. Todo o resto do pipeline roda depois
 * dela, sobre o resultado. O pior caso de uma alucinação é classificar como
 * STATUS_NF de uma nota que a pessoa não pode ver — e essa consulta já é
 * filtrada pelo CNPJ dela no `where`.
 */
async function interpretarFallback(
  _msg: MensagemEntrada,
  _identidade: Identidade
): Promise<Intencao | null> {
  return null;
}

export async function atender(msg: MensagemEntrada, baseUrl: string): Promise<Atendimento> {
  const identidade = await resolverIdentidade(msg.telefone);

  let intencao = classificar(msg);
  if (intencao.tipo === "NAO_ENTENDIDA") {
    const salvo = await interpretarFallback(msg, identidade);
    if (salvo) intencao = salvo;
  }

  // Localização: só registrada, nunca respondida. Confirmar custaria uma
  // mensagem da cota por ping, e o motorista já vê o tique do WhatsApp.
  if (intencao.tipo === "LOCALIZACAO_MOTORISTA") {
    return {
      identidade,
      intencao,
      resposta: null,
      motivoSemResposta: "localização é registrada, não respondida",
    };
  }

  // Endereço é a única coisa que número desconhecido recebe: já está no site
  // e na DANFE, não é dado de ninguém.
  if (intencao.tipo === "ENDERECO_EMPRESA") {
    return { identidade, intencao, resposta: respostaEndereco() };
  }

  if (!identidade.conhecido) {
    return {
      identidade,
      intencao,
      resposta: intencao.tipo === "STATUS_NF" ? respostaSemCadastro() : respostaMenu(false),
    };
  }

  if (intencao.tipo === "STATUS_NF") {
    const entrega = await buscarParaBot(intencao.termo, {
      emitenteCnpjIn: identidade.embarcadores.map((e) => e.cnpj),
      motoristaId: identidade.motorista?.id,
    });

    // Mesma frase para "não existe" e "não é sua": ver respostas.ts.
    return entrega
      ? { identidade, intencao, resposta: respostaStatus(entrega, baseUrl), entregaId: entrega.id }
      : { identidade, intencao, resposta: respostaNaoEncontrada(intencao.termo) };
  }

  return { identidade, intencao, resposta: respostaMenu(true) };
}
