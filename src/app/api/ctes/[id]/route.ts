import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAcesso() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any).role;
  if (!["ADMIN", "FINANCEIRO", "OPERACIONAL"].includes(role)) {
    return { error: "Acesso negado", status: 403 };
  }
  return { session };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const cte = await prisma.cTe.findUnique({
    where: { id: params.id },
    include: {
      notas: { include: { entrega: { select: { id: true, codigo: true, razaoSocial: true, cidade: true, uf: true } } } },
      fatura: { select: { id: true, numero: true, status: true } },
    },
  });
  if (!cte) return NextResponse.json({ error: "CT-e não encontrado" }, { status: 404 });
  return NextResponse.json(cte);
}

// PATCH — atualizar vínculo (adicionar/remover notas), rateando o valorFrete nas entregas
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const cte = await prisma.cTe.findUnique({
    where: { id: params.id },
    include: { notas: { select: { id: true, entregaId: true } } },
  });
  if (!cte) return NextResponse.json({ error: "CT-e não encontrado" }, { status: 404 });

  // notaIds = lista completa de NFs que devem ficar vinculadas ao CT-e após esta operação
  if (Array.isArray(body.notaIds)) {
    const targetIds: string[] = body.notaIds;
    const currentIds = cte.notas.map((n) => n.id);
    const toAdd = targetIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !targetIds.includes(id));

    if (toRemove.length > 0) {
      await prisma.notaFiscal.updateMany({ where: { id: { in: toRemove } }, data: { cteId: null } });
    }
    if (toAdd.length > 0) {
      await prisma.notaFiscal.updateMany({ where: { id: { in: toAdd } }, data: { cteId: params.id } });
    }

    // Refaz o rateio de valorFrete nas entregas afetadas
    const notasAtualizadas = await prisma.notaFiscal.findMany({
      where: { cteId: params.id },
      select: { entregaId: true },
    });
    const entregaIds = Array.from(new Set(notasAtualizadas.map((n) => n.entregaId).filter(Boolean))) as string[];
    if (entregaIds.length > 0) {
      const rateado = cte.valorReceber / entregaIds.length;
      for (const eId of entregaIds) {
        await prisma.entrega.update({ where: { id: eId }, data: { valorFrete: rateado } });
      }
    }

    // Zera valorFrete das entregas que ficaram sem CT-e vinculado
    const entregasRemovidas = cte.notas
      .filter((n) => toRemove.includes(n.id) && n.entregaId)
      .map((n) => n.entregaId!) as string[];
    for (const eId of Array.from(new Set(entregasRemovidas))) {
      // Só zera se essa entrega não tiver outra nota com cte
      const outraNota = await prisma.notaFiscal.findFirst({
        where: { entregaId: eId, cteId: { not: null, notIn: [params.id] } },
      });
      if (!outraNota) {
        await prisma.entrega.update({ where: { id: eId }, data: { valorFrete: 0 } });
      }
    }
  }

  const atualizado = await prisma.cTe.findUnique({
    where: { id: params.id },
    include: { notas: { include: { entrega: { select: { id: true, codigo: true, razaoSocial: true } } } } },
  });

  return NextResponse.json(atualizado);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const cte = await prisma.cTe.findUnique({
    where: { id: params.id },
    include: { notas: { select: { id: true, entregaId: true } }, fatura: { select: { id: true } } },
  });
  if (!cte) return NextResponse.json({ error: "CT-e não encontrado" }, { status: 404 });
  if (cte.fatura) {
    return NextResponse.json({ error: "Este CT-e está em uma fatura. Cancele a fatura antes de excluir." }, { status: 400 });
  }

  const entregaIds = Array.from(new Set(cte.notas.map((n) => n.entregaId).filter(Boolean))) as string[];

  // Desvincula notas
  await prisma.notaFiscal.updateMany({ where: { cteId: params.id }, data: { cteId: null } });
  // Deleta CT-e
  await prisma.cTe.delete({ where: { id: params.id } });

  // Zera valorFrete das entregas que ficaram sem outro CT-e
  for (const eId of entregaIds) {
    const outraNota = await prisma.notaFiscal.findFirst({
      where: { entregaId: eId, cteId: { not: null } },
    });
    if (!outraNota) {
      await prisma.entrega.update({ where: { id: eId }, data: { valorFrete: 0 } });
    }
  }

  return NextResponse.json({ ok: true });
}
