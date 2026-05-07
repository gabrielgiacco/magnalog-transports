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
  const { descricao, tipo, valor, dataVencimento, dataPagamento, status, categoriaId, subcategoriaId, favorecido, anexoUrl } = body;

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
      favorecido,
      anexoUrl
    }
  });

  return NextResponse.json(lancamento);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { id, descricao, tipo, valor, dataVencimento, dataPagamento, status, categoriaId, subcategoriaId, favorecido } = body;

  const data: any = {};
  if (descricao !== undefined) data.descricao = descricao;
  if (tipo !== undefined) data.tipo = tipo;
  if (valor !== undefined) data.valor = parseFloat(valor);
  if (dataVencimento !== undefined) data.dataVencimento = new Date(dataVencimento);
  if (dataPagamento !== undefined) data.dataPagamento = dataPagamento ? new Date(dataPagamento) : null;
  if (status !== undefined) data.status = status;
  if (categoriaId !== undefined) data.categoriaId = categoriaId || null;
  if (subcategoriaId !== undefined) data.subcategoriaId = subcategoriaId || null;
  if (favorecido !== undefined) data.favorecido = favorecido;

  const lancamento = await prisma.lancamentoFinanceiro.update({
    where: { id },
    data
  });

  return NextResponse.json(lancamento);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem excluir lançamentos" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.lancamentoFinanceiro.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
