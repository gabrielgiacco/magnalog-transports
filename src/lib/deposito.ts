import {
  Prisma,
  PrismaClient,
  DepositoItem,
  MotivoBaixaDeposito,
  StatusDevolucao,
} from "@prisma/client";

// Núcleo de domínio do Depósito. DepositoItem é quem sabe "a mercadoria está
// fisicamente aqui"; NotaDevolucao.status é só um espelho lido pela tela de
// Avarias e pelo seletor da Declaração de Saída. Este arquivo é o ÚNICO lugar
// que escreve os dois. Avaria.status nunca é tocado aqui: sair do CD não
// resolve a reclamação.

export const LIMITE_ATENCAO = 15;
export const LIMITE_CRITICO = 30;

/** Aceita tanto o client de uma transação em andamento quanto o PrismaClient
 * direto, para que cada chamador decida se compõe numa transação existente
 * (Declaração de Saída, tela de Avarias) ou abre a sua própria. */
type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Relógio do depósito: dataEntrada -> dataSaida (ou hoje, se ainda parado).
 * NÃO é o relógio da armazenagem (entrega.dataChegada -> entrega.dataEntrega),
 * que continua onde está — são perguntas diferentes de propósito.
 */
export function diasParados(dataEntrada: Date | string, dataSaida?: Date | string | null): number {
  const inicio = new Date(dataEntrada).getTime();
  const fim = dataSaida ? new Date(dataSaida).getTime() : Date.now();
  return Math.max(0, Math.floor((fim - inicio) / (1000 * 60 * 60 * 24)));
}

/** Para onde cada motivo de baixa espelha o status da NotaDevolucao. */
export const STATUS_DEVOLUCAO_POR_MOTIVO: Record<MotivoBaixaDeposito, StatusDevolucao> = {
  REEXPEDIDO: "RETIRADO",
  DEVOLVIDO_EMBARCADOR: "DEVOLVIDO_CLIENTE",
  RETIRADO_EMBARCADOR: "RETIRADO",
  DESCARTE: "DESCARTADO",
};

// A tela de Avarias só informa o status; RETIRADO é ambíguo entre reexpedição
// e retirada pelo embarcador. "Dar Saída" ali significa que alguém levou, que
// é RETIRADO_EMBARCADOR — e o conferente pode corrigir no item depois.
const MOTIVO_POR_STATUS_DEVOLUCAO: Partial<Record<StatusDevolucao, MotivoBaixaDeposito>> = {
  RETIRADO: "RETIRADO_EMBARCADOR",
  DEVOLVIDO_CLIENTE: "DEVOLVIDO_EMBARCADOR",
  DESCARTADO: "DESCARTE",
};

/**
 * Próximo código DEP-00001. Usa max(codigo), não count(): count repete
 * código depois de um delete. Mesmo idioma de
 * src/app/api/declaracoes-saida/route.ts.
 */
export async function proximoCodigoDeposito(tx: Tx): Promise<string> {
  const ultimo = await tx.depositoItem.findFirst({
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  });
  const n = ultimo ? parseInt(ultimo.codigo.slice(4), 10) + 1 : 1;
  return `DEP-${String(n).padStart(5, "0")}`;
}

/** Grava o status+data na NotaDevolucao ligada ao item que acabou de fechar,
 * espelhando exatamente o que src/app/api/avarias/[id]/devolucao/route.ts
 * (PUT, linhas ~95-97) já faz manualmente. */
async function espelharNotaDevolucao(
  tx: Tx,
  notaDevolucaoId: string,
  motivo: MotivoBaixaDeposito,
  responsavel: string | null | undefined,
  data: Date,
): Promise<void> {
  const status = STATUS_DEVOLUCAO_POR_MOTIVO[motivo];
  const dataUpdate: {
    status: StatusDevolucao;
    responsavel?: string;
    dataRetorno?: Date;
    dataRetirada?: Date;
    dataDescarte?: Date;
  } = { status };
  if (responsavel) dataUpdate.responsavel = responsavel;
  if (status === "DEVOLVIDO_CLIENTE") dataUpdate.dataRetorno = data;
  if (status === "RETIRADO") dataUpdate.dataRetirada = data;
  if (status === "DESCARTADO") dataUpdate.dataDescarte = data;

  // updateMany, não update: a NFD pode ter sido apagada por fora; isso nunca
  // pode derrubar a transação de quem chamou.
  await tx.notaDevolucao.updateMany({ where: { id: notaDevolucaoId }, data: dataUpdate });
}

/**
 * Baixa (total ou parcial) de um item. Grava o movimento BAIXA e espelha em
 * NotaDevolucao quando o item veio de uma NFD e a baixa fechou o saldo.
 */
export async function darBaixa(
  tx: Tx,
  params: {
    itemId: string;
    motivo: MotivoBaixaDeposito;
    volumes?: number;
    responsavel?: string | null;
    documento?: string | null;
    dataSaida?: Date | null;
    observacoes?: string | null;
    usuarioId: string;
  },
): Promise<{ ok: true; item: DepositoItem } | { ok: false; erro: string }> {
  const item = await tx.depositoItem.findUnique({ where: { id: params.itemId } });
  if (!item) return { ok: false, erro: "Item de depósito não encontrado" };
  if (item.status === "BAIXADO") return { ok: false, erro: "Item já está baixado" };

  const saldo = item.volumes - item.volumesBaixados;
  const volumesBaixa = params.volumes ?? saldo;
  if (volumesBaixa <= 0) return { ok: false, erro: "Não há volumes pendentes para baixar" };
  if (volumesBaixa > saldo) {
    return { ok: false, erro: `Baixa de ${volumesBaixa} volume(s) excede o saldo em estoque (${saldo})` };
  }

  const novoVolumesBaixados = item.volumesBaixados + volumesBaixa;
  const completa = novoVolumesBaixados >= item.volumes;
  const dataSaidaFinal = params.dataSaida ?? new Date();

  // updateMany com guarda de status, não update: se outra operação já baixou
  // o item entre o findUnique e aqui, count fica 0 em vez de estourar P2025.
  const atualizado = await tx.depositoItem.updateMany({
    where: { id: item.id, status: "EM_ESTOQUE" },
    data: {
      volumesBaixados: novoVolumesBaixados,
      status: completa ? "BAIXADO" : "EM_ESTOQUE",
      dataSaida: completa ? dataSaidaFinal : undefined,
      motivoBaixa: params.motivo,
      responsavelSaida: params.responsavel ?? undefined,
      documentoSaida: params.documento ?? undefined,
      observacoesSaida: params.observacoes ?? undefined,
      baixadoPorId: completa ? params.usuarioId : undefined,
    },
  });
  if (atualizado.count === 0) {
    return { ok: false, erro: "Item não está em estoque (baixado em outra operação)" };
  }

  await tx.depositoMovimento.create({
    data: {
      itemId: item.id,
      tipo: "BAIXA",
      volumes: volumesBaixa,
      motivo: params.motivo,
      documento: params.documento ?? null,
      responsavel: params.responsavel ?? null,
      observacoes: params.observacoes ?? null,
      usuarioId: params.usuarioId,
    },
  });

  if (completa && item.notaDevolucaoId) {
    await espelharNotaDevolucao(tx, item.notaDevolucaoId, params.motivo, params.responsavel, dataSaidaFinal);
  }

  const itemAtualizado = await tx.depositoItem.findUnique({ where: { id: item.id } });
  return { ok: true, item: itemAtualizado as DepositoItem };
}

/**
 * Fecha os itens de depósito ligados a estas NFDs/avarias. Chamado de dentro
 * da transação da Declaração de Saída. Devolve quantos fechou — nunca lança,
 * porque não ter item de depósito é o caso normal para toda NFD/avaria
 * anterior a este módulo.
 */
export async function baixarPorReferencias(
  tx: Tx,
  params: {
    notaDevolucaoIds?: string[];
    avariaIds?: string[];
    motivo: MotivoBaixaDeposito;
    documento?: string | null;
    responsavel?: string | null;
    usuarioId: string;
  },
): Promise<number> {
  const notaDevolucaoIds = (params.notaDevolucaoIds ?? []).filter(Boolean);
  const avariaIds = (params.avariaIds ?? []).filter(Boolean);
  if (notaDevolucaoIds.length === 0 && avariaIds.length === 0) return 0;

  const or: Prisma.DepositoItemWhereInput[] = [];
  if (notaDevolucaoIds.length) or.push({ notaDevolucaoId: { in: notaDevolucaoIds } });
  if (avariaIds.length) or.push({ avariaId: { in: avariaIds } });

  const itens = await tx.depositoItem.findMany({ where: { status: "EM_ESTOQUE", OR: or } });

  let fechados = 0;
  for (const item of itens) {
    const resultado = await darBaixa(tx, {
      itemId: item.id,
      motivo: params.motivo,
      volumes: item.volumes - item.volumesBaixados,
      documento: params.documento,
      responsavel: params.responsavel,
      usuarioId: params.usuarioId,
    });
    if (resultado.ok) fechados++;
  }
  return fechados;
}

/**
 * Quando a tela de Avarias muda o status de uma NFD, fecha (ou reabre) o
 * item de depósito correspondente. Direção inversa de darBaixa: aqui o
 * status da NotaDevolucao já é o dado de entrada, não o resultado.
 */
export async function sincronizarPorNotaDevolucao(
  tx: Tx,
  notaDevolucaoId: string,
  status: StatusDevolucao,
  usuarioId: string,
): Promise<void> {
  const item = await tx.depositoItem.findUnique({ where: { notaDevolucaoId } });
  if (!item) return; // NFD sem item de depósito — nada a sincronizar

  if (status === "PENDENTE") {
    if (item.status !== "BAIXADO") return;
    const reaberto = await tx.depositoItem.updateMany({
      where: { id: item.id, status: "BAIXADO" },
      data: { status: "EM_ESTOQUE", volumesBaixados: 0, dataSaida: null, motivoBaixa: null, baixadoPorId: null },
    });
    if (reaberto.count > 0) {
      await tx.depositoMovimento.create({
        data: { itemId: item.id, tipo: "ESTORNO", volumes: item.volumesBaixados, usuarioId },
      });
    }
    return;
  }

  if (item.status === "BAIXADO") return; // já fechado, idempotente

  const motivo = MOTIVO_POR_STATUS_DEVOLUCAO[status] ?? null;
  const volumesFechar = Math.max(item.volumes - item.volumesBaixados, 0);
  const fechado = await tx.depositoItem.updateMany({
    where: { id: item.id, status: "EM_ESTOQUE" },
    data: {
      status: "BAIXADO",
      volumesBaixados: item.volumes,
      dataSaida: new Date(),
      motivoBaixa: motivo,
      baixadoPorId: usuarioId,
    },
  });
  if (fechado.count > 0) {
    await tx.depositoMovimento.create({
      data: { itemId: item.id, tipo: "BAIXA", volumes: volumesFechar, motivo, usuarioId },
    });
  }
}

/**
 * Estorno da próxima baixa não desfeita, em ordem LIFO: com [B3, B7, E7], o
 * próximo estorno tem de mirar a B3 — olhar só o movimento mais recente
 * pararia no próprio E7 e deixaria o saldo preso. Item volta o saldo que
 * tinha antes dessa baixa, grava movimento ESTORNO, e o espelho volta para
 * PENDENTE — a mercadoria está de volta em estoque.
 */
export async function estornarBaixa(
  tx: Tx,
  itemId: string,
  usuarioId: string,
): Promise<{ ok: true; item: DepositoItem } | { ok: false; erro: string }> {
  const item = await tx.depositoItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, erro: "Item de depósito não encontrado" };

  // Conta quantos estornos já existem e pula esse tanto de baixas a partir do
  // fim: cada estorno "consome" a baixa mais recente ainda não desfeita.
  const movimentos = await tx.depositoMovimento.findMany({
    where: { itemId: item.id, tipo: { in: ["BAIXA", "ESTORNO"] } },
    orderBy: { createdAt: "desc" },
    select: { tipo: true, volumes: true },
  });
  const estornos = movimentos.filter((m) => m.tipo === "ESTORNO").length;
  const baixas = movimentos.filter((m) => m.tipo === "BAIXA");
  const alvo = baixas[estornos];
  if (!alvo) return { ok: false, erro: "Não há baixa para estornar neste item" };

  const restante = Math.max(0, item.volumesBaixados - alvo.volumes);

  // O item volta a estoque de qualquer forma (total ou parcial), então os
  // campos de saída limpam independente de `restante` ficar em 0 ou não.
  const atualizado = await tx.depositoItem.updateMany({
    where: { id: item.id, volumesBaixados: item.volumesBaixados },
    data: { status: "EM_ESTOQUE", volumesBaixados: restante, dataSaida: null, motivoBaixa: null, baixadoPorId: null },
  });
  if (atualizado.count === 0) {
    return { ok: false, erro: "Item alterado em outra operação" };
  }

  await tx.depositoMovimento.create({
    data: { itemId: item.id, tipo: "ESTORNO", volumes: alvo.volumes, usuarioId },
  });

  if (item.notaDevolucaoId) {
    await tx.notaDevolucao.updateMany({
      where: { id: item.notaDevolucaoId },
      data: { status: "PENDENTE", dataRetorno: null, dataRetirada: null, dataDescarte: null },
    });
  }

  const itemAtualizado = await tx.depositoItem.findUnique({ where: { id: item.id } });
  return { ok: true, item: itemAtualizado as DepositoItem };
}
