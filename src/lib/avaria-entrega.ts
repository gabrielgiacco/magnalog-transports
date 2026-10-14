import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * A avaria acompanha a NF. Ela guarda um unico entregaId, mas o vinculo real
 * e a NF (Avaria.notaFiscalId e, na declaracao, AvariaProduto.notaFiscalId).
 * Quando notas sao separadas para outra entrega, a avaria ficava presa na
 * entrega antiga.
 */

/** Filtro: avarias da entrega pelo vinculo direto OU por qualquer NF dela. */
export function avariasDaEntrega(entregaId: string): Prisma.AvariaWhereInput {
  return {
    OR: [
      { entregaId },
      { notaFiscal: { entregaId } },
      { produtos: { some: { notaFiscal: { entregaId } } } },
    ],
  };
}

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * Depois de mover notas de `entregaOrigemId`: a avaria presa nela cujas NFs
 * foram TODAS para uma mesma outra entrega passa a apontar para essa entrega.
 * Avaria com NFs que ficaram (ou espalhadas em varias entregas) continua onde
 * esta — e aparece nas duas pela busca de `avariasDaEntrega`.
 */
export async function realinharAvariasDaEntrega(db: Cliente, entregaOrigemId: string): Promise<number> {
  const avarias = await db.avaria.findMany({
    where: { entregaId: entregaOrigemId },
    select: {
      id: true,
      notaFiscal: { select: { entregaId: true } },
      produtos: { select: { notaFiscal: { select: { entregaId: true } } } },
    },
  });

  let movidas = 0;
  for (const a of avarias) {
    const destinos = new Set(
      [a.notaFiscal, ...a.produtos.map((p) => p.notaFiscal)]
        .filter((n): n is { entregaId: string | null } => !!n)
        .map((n) => n.entregaId),
    );
    if (destinos.size !== 1) continue;
    const [destino] = Array.from(destinos);
    if (!destino || destino === entregaOrigemId) continue;
    await db.avaria.update({ where: { id: a.id }, data: { entregaId: destino } });
    movidas++;
  }
  return movidas;
}
