import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ativo = searchParams.get("ativo");

  const motoristas = await prisma.motorista.findMany({
    where: ativo !== null ? { ativo: ativo === "true" } : {},
    orderBy: { nome: "asc" },
    include: {
      _count: { select: { entregas: true, rotas: true } },
    },
  });

  return NextResponse.json(motoristas);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const motorista = await prisma.motorista.create({
    data: {
      nome: body.nome,
      cpf: body.cpf || null,
      cnh: body.cnh || null,
      categoriaCnh: body.categoriaCnh || null,
      telefone: body.telefone || null,
      pix: body.pix || null,
      tipo: body.tipo || "TERCEIRO",
      valorDiaria: body.valorDiaria ? parseFloat(body.valorDiaria) : null,
    },
  });

  return NextResponse.json(motorista, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { id, ...data } = body;

  Object.keys(data).forEach((key) => {
    if (data[key] === "") {
      data[key] = null;
    }
  });

  if (data.valorDiaria !== undefined && data.valorDiaria !== null) {
    data.valorDiaria = parseFloat(data.valorDiaria);
  }

  const motorista = await prisma.motorista.update({ where: { id }, data });
  return NextResponse.json(motorista);
}
