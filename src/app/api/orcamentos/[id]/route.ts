import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const orcamento = await prisma.orcamento.findUnique({
    where: { id: params.id },
    include: {
      criadoPor: { select: { id: true, name: true } },
      itens: { orderBy: { descricao: "asc" } },
    },
  });
  if (!orcamento) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });

  return NextResponse.json(orcamento);
}
