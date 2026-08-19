import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

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
