import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const veiculos = await prisma.veiculo.findMany({
    where: { ativo: true },
    orderBy: { placa: "asc" },
    include: {
      motorista: { select: { id: true, nome: true } },
      dono: { select: { id: true, nome: true, telefone: true } },
      _count: { select: { entregas: true } },
    },
  });

  return NextResponse.json(veiculos);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  try {
    const ano = body.ano ? parseInt(body.ano) : null;
    const capacidadeKg = body.capacidadeKg ? parseFloat(body.capacidadeKg) : null;

    const veiculo = await prisma.veiculo.create({
      data: {
        placa: body.placa.toUpperCase(),
        tipo: body.tipo,
        modelo: body.modelo || null,
        ano: isNaN(ano as any) ? null : ano,
        capacidadeKg: isNaN(capacidadeKg as any) ? null : capacidadeKg,
        capacidadePaletes: typeof body.capacidadePaletes === "number" ? body.capacidadePaletes : null,
        capacidadeM3: typeof body.capacidadeM3 === "number" ? body.capacidadeM3 : null,
        motoristaId: body.motoristaId || null,
        donoId: body.donoId || null,
      },
    });

    return NextResponse.json(veiculo, { status: 201 });
  } catch (error: any) {
    console.error("Erro ao salvar veiculo:", error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Já existe um veículo cadastrado com esta placa." }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao cadastrar veículo. Verifique os dados." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { id, ...data } = body;
  
  Object.keys(data).forEach((key) => {
    if (data[key] === "") data[key] = null;
  });

  if (data.placa) data.placa = data.placa.toUpperCase();
  if (data.ano !== undefined && data.ano !== null) {
    const ano = parseInt(data.ano);
    data.ano = isNaN(ano) ? null : ano;
  }
  if (data.capacidadeKg !== undefined && data.capacidadeKg !== null) {
    const cap = parseFloat(data.capacidadeKg);
    data.capacidadeKg = isNaN(cap) ? null : cap;
  }

  try {
    const veiculo = await prisma.veiculo.update({ where: { id }, data });
    return NextResponse.json(veiculo);
  } catch (error: any) {
    console.error("Erro ao atualizar veiculo:", error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Já existe um veículo cadastrado com esta placa." }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao atualizar veículo. Verifique os dados." }, { status: 400 });
  }
}
