import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dataInicio = searchParams.get("dataInicio");
  const dataFim = searchParams.get("dataFim");
  const search = searchParams.get("search");

  const where: any = {};
  if (dataInicio || dataFim) {
    where.dataVencimento = {};
    if (dataInicio) where.dataVencimento.gte = new Date(dataInicio);
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      where.dataVencimento.lte = fim;
    }
  }
  if (search) {
    where.OR = [
      { descricao: { contains: search, mode: "insensitive" } },
      { favorecido: { contains: search, mode: "insensitive" } },
    ];
  }

  const lancamentos = await prisma.lancamentoFinanceiro.findMany({
    where,
    include: {
      categoria: true,
      subcategoria: true
    },
    orderBy: { dataVencimento: "desc" }
  });

  return NextResponse.json(lancamentos);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { descricao, tipo, valor, dataVencimento, dataPagamento, status, categoriaId, subcategoriaId, favorecido } = body;

  const lancamento = await prisma.lancamentoFinanceiro.create({
    data: {
      descricao,
      tipo,
      valor: parseFloat(valor),
      dataVencimento: new Date(dataVencimento),
      dataPagamento: dataPagamento ? new Date(dataPagamento) : null,
      status: status || (dataPagamento ? "PAGO" : "PENDENTE"),
      categoriaId: categoriaId || null,
      subcategoriaId: subcategoriaId || null,
      favorecido
    }
  });

  return NextResponse.json(lancamento);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { id, status, dataPagamento } = body;

  const lancamento = await prisma.lancamentoFinanceiro.update({
    where: { id },
    data: {
      status,
      ...(dataPagamento !== undefined && { dataPagamento: dataPagamento ? new Date(dataPagamento) : null })
    }
  });

  return NextResponse.json(lancamento);
}
