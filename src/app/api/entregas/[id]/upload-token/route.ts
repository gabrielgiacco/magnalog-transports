import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { gerarToken, TOKEN_DURACAO_MS } from "@/lib/upload-token";

// GET — devolve o token atual (se ainda válido) sem gerar novo
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const entrega = await prisma.entrega.findUnique({
    where: { id: params.id },
    select: { uploadToken: true, uploadTokenExpira: true },
  });
  if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  const valido = entrega.uploadToken && entrega.uploadTokenExpira && entrega.uploadTokenExpira > new Date();
  return NextResponse.json({
    token: valido ? entrega.uploadToken : null,
    expira: valido ? entrega.uploadTokenExpira : null,
  });
}

// POST — gera novo token (invalida anterior)
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const entrega = await prisma.entrega.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  const token = gerarToken();
  const expira = new Date(Date.now() + TOKEN_DURACAO_MS);

  await prisma.entrega.update({
    where: { id: params.id },
    data: { uploadToken: token, uploadTokenExpira: expira },
  });

  return NextResponse.json({ token, expira });
}

// DELETE — invalida o token
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  await prisma.entrega.update({
    where: { id: params.id },
    data: { uploadToken: null, uploadTokenExpira: null },
  });
  return NextResponse.json({ ok: true });
}
