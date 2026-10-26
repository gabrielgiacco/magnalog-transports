/**
 * Etapas da rota. A rota segue o mesmo fluxo da entrega direta e a etapa que as
 * telas mostram vem do status das entregas dela. Rota.status (PLANEJADA,
 * EM_ANDAMENTO, CONCLUIDA, CANCELADA) continua existindo para o link do
 * motorista, diarias e relatorios, e passa a ser derivado da etapa.
 *
 * Modulo puro (sem prisma): o Kanban e as telas de Rotas importam.
 */

export const FLUXO_ENTREGA = ["PROGRAMADO", "EM_SEPARACAO", "CARREGADO", "EM_ROTA", "ENTREGUE", "FINALIZADO"] as const;
export type EtapaEntrega = (typeof FLUXO_ENTREGA)[number];

const IDX_ENTREGUE = 4;

/** Posicao no fluxo; -1 para o que esta fora dele (OCORRENCIA). */
export function indiceEtapa(status: string): number {
  return (FLUXO_ENTREGA as readonly string[]).indexOf(status);
}

/**
 * Etapa da rota: a da entrega mais atrasada, sem contar as que estao em
 * ocorrencia. So ocorrencias → "OCORRENCIA"; rota sem entregas → null.
 */
export function etapaDaRota(statusEntregas: readonly string[]): EtapaEntrega | "OCORRENCIA" | null {
  const noFluxo = statusEntregas.map(indiceEtapa).filter((i) => i >= 0);
  if (noFluxo.length > 0) return FLUXO_ENTREGA[Math.min(...noFluxo)];
  return statusEntregas.length > 0 ? "OCORRENCIA" : null;
}

/** Proxima etapa do botao da tela de Rotas; null quando ja finalizou ou nao ha etapa. */
export function proximaEtapa(etapa: string | null): EtapaEntrega | null {
  const i = etapa ? indiceEtapa(etapa) : -1;
  if (i < 0 || i >= FLUXO_ENTREGA.length - 1) return null;
  return FLUXO_ENTREGA[i + 1];
}

/** Status interno da rota que corresponde a etapa. */
export function statusRotaDaEtapa(etapa: EtapaEntrega): "PLANEJADA" | "EM_ANDAMENTO" | "CONCLUIDA" {
  if (etapa === "EM_ROTA") return "EM_ANDAMENTO";
  if (etapa === "ENTREGUE" || etapa === "FINALIZADO") return "CONCLUIDA";
  return "PLANEJADA";
}

/** Status de uma entrega que entra numa rota ja existente. */
export function statusParaNovaEntrega(etapa: string | null): EtapaEntrega {
  return etapa === "CARREGADO" || etapa === "EM_ROTA" ? etapa : "EM_SEPARACAO";
}

/**
 * Se a entrega muda quando a rota vai para `alvo`. Avancando, mudam as que
 * estao antes. Voltando (so pelo Kanban), mudam as que estao depois, sem
 * desfazer Entregue/Finalizado a nao ser que o alvo tambem seja Entregue ou
 * depois. Ocorrencia nunca muda.
 */
export function deveMover(status: string, alvo: EtapaEntrega, voltando: boolean): boolean {
  const i = indiceEtapa(status);
  const a = indiceEtapa(alvo);
  if (i < 0) return false;
  if (!voltando) return i < a;
  return i > a && (a >= IDX_ENTREGUE || i < IDX_ENTREGUE);
}
