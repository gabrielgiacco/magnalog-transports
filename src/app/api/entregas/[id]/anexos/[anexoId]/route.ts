import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { deleteObject, presignGet } from "@/lib/r2";
import { logFromRequest } from "@/lib/audit";

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

// PATCH — libera/oculta o anexo na página PÚBLICA de rastreamento.
//
// Espelha anexosSetVisibilidade() de src/lib/anexos.ts, que faz o mesmo para
// anexos de avaria no portal do cliente. A diferença que justifica o campo
// separado: lá existe login e vínculo de fornecedor; aqui basta ter o número
// da NF. Por isso a ação é restrita a ADMIN e auditada com evento próprio.
export async function PATCH(req: NextRequest, { params }: { params: { id: string; anexoId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sessionUser = session.user as any;
  if (sessionUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Só o administrador pode liberar arquivo no rastreamento" }, { status: 403 });
  }
  const userId = sessionUser.id || sessionUser.userId;

  const body = await req.json();
  const { visivelRastreio } = body;
  if (typeof visivelRastreio !== "boolean") {
    return NextResponse.json({ error: "visivelRastreio (boolean) é obrigatório" }, { status: 400 });
  }

  const existente = await prisma.anexoEntrega.findUnique({ where: { id: params.anexoId } });
  if (!existente || existente.entregaId !== params.id) {
    return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });
  }

  const anexo = await prisma.anexoEntrega.update({
    where: { id: params.anexoId },
    data: {
      visivelRastreio,
      liberadoPorId: visivelRastreio ? userId || null : null,
      liberadoEm: visivelRastreio ? new Date() : null,
    },
    include: {
      uploadadoPor: { select: { id: true, name: true } },
      liberadoPor: { select: { id: true, name: true } },
    },
  });

  await logFromRequest(req, visivelRastreio ? "ANEXO_LIBERADO_RASTREIO" : "ANEXO_OCULTADO_RASTREIO", {
    user: { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name, role: sessionUser.role },
    recursoTipo: "anexoEntrega",
    recursoId: anexo.id,
    recursoDesc: anexo.filename,
    detalhes: { entregaId: params.id, tipo: anexo.tipo, visivelRastreio },
  });

  const url = await presignGet(anexo.objectKey, 3600);
  return NextResponse.json({ ...anexo, url });
}
