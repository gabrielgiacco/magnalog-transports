import type { Prisma, PrismaClient } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/utils";

/**
 * Entrega que ficou so como arquivo de uma tentativa encerrada: status
 * OCORRENCIA e nenhuma ocorrencia em aberto. E a "casca" que a reentrega deixa
 * para tras (as NFs foram para a entrega nova). Some das telas que cobram acao
 * (Entregas, Kanban, Dashboard, sino) e continua no painel de Ocorrencias.
 */
export const ENTREGA_NAO_ARQUIVADA: Prisma.EntregaWhereInput = {
  NOT: {
    AND: [
      { status: "OCORRENCIA" },
      { ocorrencias: { some: {} } },
      { ocorrencias: { none: { resolvida: false } } },
    ],
  },
};

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Marca como resolvidas as ocorrencias em aberto das entregas do filtro. Devolve quantas baixou. */
export async function baixarOcorrenciasAbertas(
  db: Cliente,
  filtroEntrega: Prisma.EntregaWhereInput,
  resolucao: string,
): Promise<number> {
  const r = await db.ocorrencia.updateMany({
    where: { resolvida: false, entrega: filtroEntrega },
    data: { resolvida: true, resolucao },
  });
  return r.count;
}

/**
 * Texto da baixa automatica quando a entrega muda de status, ou null se a
 * mudanca nao encerra a ocorrencia. Concluir a entrega encerra; sair de
 * OCORRENCIA para qualquer outro status (ex.: "Retomar como Em Rota") tambem.
 */
export function resolucaoAutomatica(statusAnterior: string | null | undefined, statusNovo: string): string | null {
  if (statusNovo === "FINALIZADO") return "Baixa automática — entrega finalizada";
  if (statusNovo === "ENTREGUE") return "Baixa automática — entrega concluída";
  if (statusAnterior === "OCORRENCIA" && statusNovo !== "OCORRENCIA") {
    return `Baixa automática — entrega retomada (${STATUS_LABELS[statusNovo] ?? statusNovo})`;
  }
  return null;
}
