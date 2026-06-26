import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();

  if (!body.descricao) {
    return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
  }

  const ocorrencia = await prisma.ocorrencia.create({
    data: {
      entregaId: params.id,
      tipo: body.tipo || "OUTROS",
      descricao: body.descricao,
      resolucao: body.resolucao || null,
    },
  });

  const user = session.user as any;
  await logFromRequest(req, "OCORRENCIA_CRIADA", {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    recursoTipo: "ocorrencia",
    recursoId: ocorrencia.id,
    recursoDesc: `${ocorrencia.tipo} · entrega ${params.id}`,
    detalhes: { entregaId: params.id, tipo: ocorrencia.tipo, descricao: ocorrencia.descricao },
  });

  return NextResponse.json(ocorrencia, { status: 201 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();

  const ocorrencia = await prisma.ocorrencia.update({
    where: { id: body.ocorrenciaId },
    data: {
      resolucao: body.resolucao,
      resolvida: true,
    },
  });

  const user = session.user as any;
  await logFromRequest(req, "OCORRENCIA_RESOLVIDA", {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    recursoTipo: "ocorrencia",
    recursoId: ocorrencia.id,
    recursoDesc: `${ocorrencia.tipo} · entrega ${params.id}`,
    detalhes: { entregaId: params.id, resolucao: body.resolucao },
  });

  return NextResponse.json(ocorrencia);
}
