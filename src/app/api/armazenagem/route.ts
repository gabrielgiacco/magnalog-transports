import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const tabelas = await prisma.tabelaArmazenagem.findMany({ orderBy: { nomeCliente: "asc" } });
  return NextResponse.json(tabelas);
}

export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  if (!body.cnpjCliente || !body.nomeCliente) {
    return NextResponse.json({ error: "CNPJ e nome são obrigatórios" }, { status: 400 });
  }

  const tabela = await prisma.tabelaArmazenagem.upsert({
    where: { cnpjCliente: body.cnpjCliente.replace(/\D/g, "") },
    update: {
      nomeCliente: body.nomeCliente,
      diasFree: body.diasFree ?? 0,
      valorPaleteDia: body.valorPaleteDia ?? 0,
    },
    create: {
      cnpjCliente: body.cnpjCliente.replace(/\D/g, ""),
      nomeCliente: body.nomeCliente,
      diasFree: body.diasFree ?? 0,
      valorPaleteDia: body.valorPaleteDia ?? 0,
    },
  });

  return NextResponse.json(tabela, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.tabelaArmazenagem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
