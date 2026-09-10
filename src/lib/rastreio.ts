// Resolução de "que entrega é essa?" a partir de um termo digitado.
//
// A regra estava embutida em src/app/api/tracking/[id]/route.ts e agora é
// compartilhada, para que a página pública e o atendimento por WhatsApp nunca
// divirjam sobre o que é uma NF. O `select`, o presign de anexo e a auditoria
// continuam na rota — só a regra de BUSCA saiu.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Onde procurar o termo: número da NF primeiro, que é como o cliente pensa;
 * código Magnalog e id do banco como reserva.
 *
 * Igualdade exata, não `contains`: um `contains` faria "134" casar com
 * "1341", "21349" e mais uma dúzia, e a primeira que voltasse seria a resposta.
 */
export function whereBusca(termo: string): Prisma.EntregaWhereInput {
  const digitos = termo.replace(/D/g, "");
  // Chave de acesso tem 44 dígitos e é @unique em NotaFiscal: quando o termo é
  // uma chave, é o casamento mais barato e exato que existe. Quem copia da
  // DANFE cola a chave, não o número — na página pública isso também passa a
  // funcionar, que é o ganho de as duas dividirem esta regra.
  const porChave = digitos.length === 44 ? [{ notas: { some: { chaveAcesso: digitos } } }] : [];

  return {
    OR: [
      ...porChave,
      { notas: { some: { numero: termo } } },
      { codigo: termo },
      { id: termo },
    ],
  };
}

/**
 * Filtro de AUTORIZAÇÃO. Vira cláusula do `where`, nunca filtro em JS depois
 * da consulta — filtrar depois obriga a distinguir "não existe" de "não é
 * sua", e essa distinção transforma o bot num oráculo de quais notas existem.
 */
export interface FiltroBot {
  /** CNPJs de emitente que este número pode ver. */
  emitenteCnpjIn?: string[];
  /** Entregas em que este motorista é o principal ou o complementar. */
  motoristaId?: string;
}

export interface ResumoEntrega {
  id: string;
  codigo: string;
  status: string;
  destinatario: string;
  cidade: string;
  uf: string | null;
  dataAgendada: Date | null;
  dataEntrega: Date | null;
  motorista: string | null;
  placa: string | null;
  notas: string[];
  /** Ocorrências em aberto — se houver, é o que o cliente precisa saber. */
  ocorrencias: { tipo: string; descricao: string }[];
}

/**
 * Acha a entrega que o termo aponta, DENTRO do que o filtro permite ver.
 *
 * Sem nenhum critério de autorização devolve null: número desconhecido não vê
 * nada. É a diferença entre um atendimento e uma consulta aberta de carga
 * alheia.
 *
 * Atenção ao CNPJ: o casamento é exato. Empresa com mais de uma filial —
 * Heinz e Doce Mineiro têm duas cada nesta base — precisa de um cadastro por
 * CNPJ em TabelaTicket, senão as notas da outra filial não aparecem para o
 * contato. É de propósito: casar pela raiz de 8 dígitos ampliaria a
 * autorização sem ninguém decidir isso explicitamente.
 */
export async function buscarParaBot(
  termo: string,
  filtro: FiltroBot
): Promise<ResumoEntrega | null> {
  const permissoes: Prisma.EntregaWhereInput[] = [];

  if (filtro.emitenteCnpjIn?.length) {
    permissoes.push({ notas: { some: { emitenteCnpj: { in: filtro.emitenteCnpjIn } } } });
  }
  if (filtro.motoristaId) {
    permissoes.push({
      OR: [{ motoristaId: filtro.motoristaId }, { motoristaComplId: filtro.motoristaId }],
    });
  }

  if (permissoes.length === 0) return null;

  const entrega = await prisma.entrega.findFirst({
    where: { AND: [whereBusca(termo), { OR: permissoes }] },
    select: {
      id: true,
      codigo: true,
      status: true,
      razaoSocial: true,
      cidade: true,
      uf: true,
      dataAgendada: true,
      dataEntrega: true,
      motorista: { select: { nome: true } },
      veiculo: { select: { placa: true } },
      notas: { select: { numero: true } },
      ocorrencias: {
        where: { resolvida: false },
        select: { tipo: true, descricao: true },
        orderBy: { createdAt: "desc" },
        take: 2,
      },
    },
  });

  if (!entrega) return null;

  return {
    id: entrega.id,
    codigo: entrega.codigo,
    status: entrega.status,
    destinatario: entrega.razaoSocial,
    cidade: entrega.cidade,
    uf: entrega.uf,
    dataAgendada: entrega.dataAgendada,
    dataEntrega: entrega.dataEntrega,
    motorista: entrega.motorista?.nome?.trim() || null,
    placa: entrega.veiculo?.placa || null,
    notas: entrega.notas.map((n) => n.numero),
    ocorrencias: entrega.ocorrencias,
  };
}
