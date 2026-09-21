import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const data: any = {};

  if (body.nf !== undefined) data.nf = String(body.nf);
  if (body.tipoPallet !== undefined) data.tipoPallet = body.tipoPallet;
  if (body.dataEmissao !== undefined) data.dataEmissao = new Date(body.dataEmissao);
  if (body.quantidade !== undefined) data.quantidade = parseInt(body.quantidade) || 0;
  if (body.cnpjCliente !== undefined) data.cnpjCliente = String(body.cnpjCliente).replace(/\D/g, "");
  if (body.razaoCliente !== undefined) data.razaoCliente = body.razaoCliente;
  if (body.glnCliente !== undefined) data.glnCliente = body.glnCliente || null;
  if (body.tipoMovimento !== undefined) data.tipoMovimento = body.tipoMovimento;
  if (body.status !== undefined) data.status = body.status;
  if (body.observacoes !== undefined) data.observacoes = body.observacoes || null;
  if (body.ticketBaixa !== undefined) data.ticketBaixa = body.ticketBaixa || null;

  const movimento = await prisma.paleteMovimento.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(movimento);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;

  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.paleteMovimento.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
