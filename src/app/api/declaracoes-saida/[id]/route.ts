import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const declaracao = await prisma.declaracaoSaida.findUnique({
    where: { id: params.id },
    include: {
      emitidoPor: { select: { id: true, name: true } },
      itens: { orderBy: [{ origem: "asc" }, { referencia: "asc" }] },
    },
  });
  if (!declaracao) return NextResponse.json({ error: "Declaração não encontrada" }, { status: 404 });

  return NextResponse.json(declaracao);
}
