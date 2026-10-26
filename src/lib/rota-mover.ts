import type { Prisma, PrismaClient } from "@prisma/client";
import { baixarOcorrenciasAbertas, resolucaoAutomatica } from "@/lib/ocorrencia-baixa";
import { deveMover, etapaDaRota, indiceEtapa, statusRotaDaEtapa, type EtapaEntrega } from "@/lib/rota-etapa";

type Cliente = PrismaClient | Prisma.TransactionClient;
type EntregaDaRota = { id: string; status: string; dataEntrega: Date | null };

export type ResultadoMoverRota =
  | { ok: true; etapa: string; movidas: number }
  | { ok: false; http: number; erro: string; mensagem: string };

const falha = (http: number, erro: string, mensagem: string): ResultadoMoverRota => ({ ok: false, http, erro, mensagem });

const ehConclusao = (etapa: EtapaEntrega) => etapa === "ENTREGUE" || etapa === "FINALIZADO";

/** Entregas que mudam quando a rota vai para `etapa` (regras em rota-etapa.ts). */
function entregasAMover(entregas: EntregaDaRota[], etapa: EtapaEntrega): EntregaDaRota[] {
  const atual = etapaDaRota(entregas.map((e) => e.status));
  const voltando = atual !== null && indiceEtapa(atual) > indiceEtapa(etapa);
  return entregas.filter((e) => deveMover(e.status, etapa, voltando));
}

/** Grava a etapa nas entregas. `dataEntrega` só preenche as que ainda não têm data. */
async function gravarEtapa(db: Cliente, ids: string[], etapa: EtapaEntrega, dataEntrega: Date | null) {
  if (ids.length === 0) return;
  // Só as entregas que mudaram: uma entrega da rota em ocorrência continua com a ocorrência aberta.
  const resolucao = resolucaoAutomatica(null, etapa);
  if (resolucao) await baixarOcorrenciasAbertas(db, { id: { in: ids } }, resolucao);
  await db.entrega.updateMany({
    where: { id: { in: ids } },
    data: { status: etapa, ...(etapa === "FINALIZADO" ? { statusCanhoto: "RECEBIDO" } : {}) },
  });
  if (dataEntrega) {
    await db.entrega.updateMany({ where: { id: { in: ids }, dataEntrega: null }, data: { dataEntrega } });
  }
}

/**
 * Leva a rota para a etapa `alvo`. Única regra usada pela tela de Rotas e pelo
 * Kanban; chamar dentro de uma transação. Também ajusta Rota.status.
 */
export async function moverRota(db: Cliente, rotaId: string, alvo: string, dataEntrega: Date | null): Promise<ResultadoMoverRota> {
  if (indiceEtapa(alvo) < 0) {
    return falha(400, "ETAPA_INVALIDA", "A rota não vai para Ocorrência: registre a ocorrência na entrega.");
  }
  const etapa = alvo as EtapaEntrega;

  const rota = await db.rota.findUnique({
    where: { id: rotaId },
    select: { status: true, entregas: { select: { id: true, status: true, dataEntrega: true } } },
  });
  if (!rota) return falha(404, "ROTA_NAO_ENCONTRADA", "Rota não encontrada.");
  if (rota.status === "CANCELADA") return falha(400, "ROTA_CANCELADA", "Rota cancelada não muda de etapa.");

  const mover = entregasAMover(rota.entregas, etapa);
  if (ehConclusao(etapa) && !dataEntrega && mover.some((e) => !e.dataEntrega)) {
    return falha(400, "DATA_ENTREGA_OBRIGATORIA", "Informe a data em que a entrega foi realizada.");
  }

  await gravarEtapa(db, mover.map((e) => e.id), etapa, ehConclusao(etapa) ? dataEntrega : null);

  const movidas = new Set(mover.map((e) => e.id));
  const etapaFinal = etapaDaRota(rota.entregas.map((e) => (movidas.has(e.id) ? etapa : e.status)));
  const base = etapaFinal && etapaFinal !== "OCORRENCIA" ? etapaFinal : etapa;
  await db.rota.update({ where: { id: rotaId }, data: { status: statusRotaDaEtapa(base) } });

  return { ok: true, etapa: etapaFinal ?? etapa, movidas: mover.length };
}
