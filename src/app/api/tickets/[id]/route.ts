import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_VALIDOS = ["ENVIADA", "APROVADA", "RECUSADA", "CANCELADA"];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const solicitacao = await prisma.solicitacaoTicket.findUnique({
    where: { id: params.id },
    include: {
      itens: true,
      entrega: { select: { id: true, codigo: true, razaoSocial: true } },
      criadoPor: { select: { name: true, email: true } },
    },
  });
  if (!solicitacao) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  return NextResponse.json(solicitacao);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const role = (session.user as any)?.role;
  if (!["ADMIN", "FINANCEIRO", "OPERACIONAL"].includes(role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json();
  const data: any = {};

  if (body.status !== undefined) {
    if (!STATUS_VALIDOS.includes(body.status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }
    data.status = body.status;
    // Marca quando saiu de ENVIADA; voltar para ENVIADA limpa a data.
    data.respondidaEm = body.status === "ENVIADA" ? null : new Date();
  }
  if (body.observacoes !== undefined) data.observacoes = body.observacoes || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const atualizada = await prisma.solicitacaoTicket.update({
    where: { id: params.id },
    data,
    include: { itens: true },
  });

  return NextResponse.json(atualizada);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.solicitacaoTicket.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
