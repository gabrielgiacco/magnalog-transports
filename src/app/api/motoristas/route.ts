import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { normalizarTelefoneBR } from "@/lib/telefone";

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
      telefoneNorm: normalizarTelefoneBR(body.telefone),
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

  // telefoneNorm é derivado, nunca informado: este PUT espalha o body inteiro
  // no update, então aceitar o campo do cliente deixaria alguém apontar o
  // telefone de um motorista para outro número e passar a receber as viagens
  // dele pelo WhatsApp. Só o telefone digitado manda.
  delete data.telefoneNorm;
  if (data.telefone !== undefined) {
    data.telefoneNorm = normalizarTelefoneBR(data.telefone);
  }

  const motorista = await prisma.motorista.update({ where: { id }, data });
  return NextResponse.json(motorista);
}
