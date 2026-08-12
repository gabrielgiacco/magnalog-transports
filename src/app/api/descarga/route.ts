import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const tabelas = await prisma.tabelaDescarga.findMany({ orderBy: { nomeCliente: "asc" } });
  return NextResponse.json(tabelas);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  if (!body.cnpjCliente || !body.nomeCliente) {
    return NextResponse.json({ error: "CNPJ e nome são obrigatórios" }, { status: 400 });
  }
  const tipo = body.tipo || "SEM_VALOR";
  if (!["POR_PALETE", "POR_AJUDANTE", "SEM_VALOR"].includes(tipo)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  const cnpjLimpo = String(body.cnpjCliente).replace(/\D/g, "");

  const tabela = await prisma.tabelaDescarga.upsert({
    where: { cnpjCliente: cnpjLimpo },
    update: {
      nomeCliente: body.nomeCliente,
      tipo,
      valorPalete: tipo === "POR_PALETE" ? (body.valorPalete ?? 0) : 0,
      valorAjudante: tipo === "POR_AJUDANTE" ? (body.valorAjudante ?? 0) : 0,
      observacoes: body.observacoes || null,
    },
    create: {
      cnpjCliente: cnpjLimpo,
      nomeCliente: body.nomeCliente,
      tipo,
      valorPalete: tipo === "POR_PALETE" ? (body.valorPalete ?? 0) : 0,
      valorAjudante: tipo === "POR_AJUDANTE" ? (body.valorAjudante ?? 0) : 0,
      observacoes: body.observacoes || null,
    },
  });

  return NextResponse.json(tabela, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.tabelaDescarga.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
