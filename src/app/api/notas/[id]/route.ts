import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";

/**
 * Marca/desmarca a nota como cancelada.
 *
 * Registro manual por escolha: a API do Meu Danfe nao informa situacao de
 * documento (Fase 0 provou isso de tres formas), entao a informacao chega do
 * cliente e alguem precisa registrar. Fica auditado para dar rastreio a algo
 * que so existe como palavra.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const sessionUser = session.user as any;
  const userId = sessionUser.id || sessionUser.userId;

  const body = await req.json().catch(() => ({}));
  if (typeof body.cancelada !== "boolean") {
    return NextResponse.json({ error: "cancelada (boolean) e obrigatorio" }, { status: 400 });
  }

  const nota = await prisma.notaFiscal.findUnique({
    where: { id: params.id },
    select: { id: true, numero: true, entregaId: true },
  });
  if (!nota) return NextResponse.json({ error: "Nota fiscal nao encontrada" }, { status: 404 });

  const atualizada = await prisma.notaFiscal.update({
    where: { id: params.id },
    data: body.cancelada
      ? {
          cancelada: true,
          canceladaEm: body.canceladaEm ? new Date(body.canceladaEm) : new Date(),
          canceladaMotivo: body.motivo || null,
          canceladaPorId: userId || null,
        }
      : { cancelada: false, canceladaEm: null, canceladaMotivo: null, canceladaPorId: null },
    include: { canceladaPor: { select: { id: true, name: true } } },
  });

  await logFromRequest(req, "NF_EDITADA", {
    user: { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name, role: sessionUser.role },
    recursoTipo: "nf",
    recursoId: nota.id,
    recursoDesc: `NF ${nota.numero}`,
    detalhes: {
      acao: body.cancelada ? "marcada como CANCELADA" : "cancelamento desfeito",
      motivo: body.motivo || null,
      entregaId: nota.entregaId,
    },
  });

  return NextResponse.json(atualizada);
}
