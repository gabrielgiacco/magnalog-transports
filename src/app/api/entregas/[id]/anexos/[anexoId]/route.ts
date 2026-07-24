import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; anexoId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const anexo = await prisma.anexoEntrega.findUnique({ where: { id: params.anexoId } });
  if (!anexo || anexo.entregaId !== params.id) {
    return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });
  }

  try {
    await deleteObject(anexo.objectKey);
  } catch (e) {
    // Ignora falha no R2 pra não travar a limpeza do DB
  }

  await prisma.anexoEntrega.delete({ where: { id: params.anexoId } });

  // Se foi o último canhoto, volta statusCanhoto pra PENDENTE
  if (anexo.tipo === "CANHOTO") {
    const restantes = await prisma.anexoEntrega.count({
      where: { entregaId: params.id, tipo: "CANHOTO" },
    });
    if (restantes === 0) {
      await prisma.entrega.update({
        where: { id: params.id },
        data: { statusCanhoto: "PENDENTE" },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
