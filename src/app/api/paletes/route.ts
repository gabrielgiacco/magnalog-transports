import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const dataInicio = searchParams.get("dataInicio");
  const dataFim = searchParams.get("dataFim");
  const tipoMovimento = searchParams.get("tipoMovimento");
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  const where: any = {};
  if (tipoMovimento) where.tipoMovimento = tipoMovimento;
  if (status) where.status = status;
  if (dataInicio || dataFim) {
    where.dataEmissao = {};
    if (dataInicio) where.dataEmissao.gte = new Date(dataInicio);
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      where.dataEmissao.lte = fim;
    }
  }
  if (q) {
    where.OR = [
      { nf: { contains: q } },
      { razaoCliente: { contains: q, mode: "insensitive" } },
      { cnpjCliente: { contains: q } },
      { ticketBaixa: { contains: q, mode: "insensitive" } },
      { observacoes: { contains: q, mode: "insensitive" } },
    ];
  }

  const movimentos = await prisma.paleteMovimento.findMany({
    where,
    orderBy: { dataEmissao: "desc" },
  });

  // Compute totals — RETORNOU neutraliza a saída (paletes voltaram ao pool)
  const totalSaida = movimentos
    .filter((m: any) => m.tipoMovimento === "SAIDA" && m.status !== "CANCELADO" && m.status !== "RETORNOU")
    .reduce((s: number, m: any) => s + m.quantidade, 0);
  const totalEntrada = movimentos
    .filter((m: any) => m.tipoMovimento === "ENTRADA" && m.status !== "CANCELADO")
    .reduce((s: number, m: any) => s + m.quantidade, 0);
  const totalRetornou = movimentos
    .filter((m: any) => m.tipoMovimento === "SAIDA" && m.status === "RETORNOU")
    .reduce((s: number, m: any) => s + m.quantidade, 0);

  return NextResponse.json({
    movimentos,
    total: movimentos.length,
    totalSaida,
    totalEntrada,
    totalRetornou,
    saldo: totalEntrada - totalSaida,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json();

  if (!body.nf || !body.cnpjCliente || !body.razaoCliente || !body.dataEmissao || !body.quantidade || !body.tipoMovimento) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }

  const movimento = await prisma.paleteMovimento.create({
    data: {
      nf: String(body.nf),
      tipoPallet: body.tipoPallet || "CHEP",
      dataEmissao: new Date(body.dataEmissao),
      quantidade: parseInt(body.quantidade) || 0,
      cnpjCliente: String(body.cnpjCliente).replace(/\D/g, ""),
      razaoCliente: body.razaoCliente,
      glnCliente: body.glnCliente || null,
      tipoMovimento: body.tipoMovimento,
      status: body.status || "PENDENTE",
      observacoes: body.observacoes || null,
      ticketBaixa: body.ticketBaixa || null,
      chaveAcessoNFe: body.chaveAcessoNFe || null,
    },
  });

  return NextResponse.json(movimento, { status: 201 });
}
