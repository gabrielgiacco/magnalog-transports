import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { compararItem, criarAvariaDaConferencia, temDivergencia } from "@/lib/conferencia";

export const dynamic = "force-dynamic";

// Encerra a conferencia: revela o esperado e abre a avaria se houver divergencia
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const user = auth.session.user as any;
  const userId: string = user.id || user.userId;

  const conf = await prisma.conferencia.findUnique({
    where: { id: params.id },
    include: {
      rota: { select: { codigo: true } },
      itens: { orderBy: [{ entregaId: "asc" }, { nfNumero: "asc" }, { descricao: "asc" }] },
    },
  });
  if (!conf) return NextResponse.json({ error: "Conferência não encontrada" }, { status: 404 });
  if (conf.status !== "EM_ANDAMENTO") return NextResponse.json({ error: "Conferência já finalizada" }, { status: 400 });

  const itens = conf.itens.map((i) => ({ ...i, resultado: compararItem(i) }));
  const divergente = itens.some((i) => temDivergencia(i.resultado));
  const status = divergente ? "COM_DIVERGENCIA" : "CONCLUIDA";

  // updateMany condicional: duas finalizacoes simultaneas nao criam duas avarias
  const avaria = await prisma
    .$transaction(async (tx) => {
      const a = divergente
        ? await criarAvariaDaConferencia(tx, { rotaCodigo: conf.rota.codigo, registradoPorId: userId, itens: conf.itens })
        : null;
      const upd = await tx.conferencia.updateMany({
        where: { id: params.id, status: "EM_ANDAMENTO" },
        data: { status, concluidaEm: new Date(), ...(a ? { avariaId: a.id } : {}) },
      });
      if (upd.count === 0) throw new Error("JA_FINALIZADA");
      return a;
    })
    .catch((e: unknown) => {
      if (e instanceof Error && e.message === "JA_FINALIZADA") return "JA_FINALIZADA" as const;
      throw e;
    });
  if (avaria === "JA_FINALIZADA") return NextResponse.json({ error: "Conferência já finalizada" }, { status: 400 });

  const resumo = {
    itens: itens.length,
    ok: itens.filter((i) => i.resultado.situacao === "OK").length,
    falta: itens.filter((i) => i.resultado.situacao === "FALTA").length,
    sobra: itens.filter((i) => i.resultado.situacao === "SOBRA").length,
    avaria: itens.filter((i) => i.resultado.avaria > 0).length,
    foraDaCarga: itens.filter((i) => i.foraDaCarga).length,
  };
  return NextResponse.json({ status, avaria, resumo, itens });
}
