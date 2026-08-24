import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const contas = await prisma.contaBancaria.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { transacoes: true } } },
  });
  return NextResponse.json({ contas });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.nome?.trim()) {
    return NextResponse.json({ error: "Nome da conta e obrigatorio" }, { status: 400 });
  }

  try {
    const conta = await prisma.contaBancaria.create({
      data: {
        nome: body.nome.trim(),
        banco: body.banco || null,
        agencia: body.agencia || null,
        numero: body.numero || null,
        identificadorOfx: body.identificadorOfx || null,
      },
    });
    return NextResponse.json(conta, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Ja existe conta com esse nome ou identificador OFX" }, { status: 409 });
    }
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "id e obrigatorio" }, { status: 400 });

  const data: any = {};
  for (const c of ["nome", "banco", "agencia", "numero", "identificadorOfx"]) {
    if (body[c] !== undefined) data[c] = body[c] || null;
  }
  if (typeof body.ativa === "boolean") data.ativa = body.ativa;

  const conta = await prisma.contaBancaria.update({ where: { id: body.id }, data });
  return NextResponse.json(conta);
}
