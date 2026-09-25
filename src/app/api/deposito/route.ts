import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";
import { diasParados, proximoCodigoDeposito } from "@/lib/deposito";

export const dynamic = "force-dynamic";

// Mesmo idioma UTC dos demais relatorios: corta a hora recebida e fixa em
// inicio/fim do dia, para nao depender do fuso do servidor.
const parseDate = (s: string, isEnd = false) =>
  new Date(s.slice(0, 10) + (isEnd ? "T23:59:59.999Z" : "T00:00:00.000Z"));

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const status = searchParams.get("status") || "EM_ESTOQUE";
  const tipoEntrada = searchParams.get("tipoEntrada");
  const embarcadorCnpj = searchParams.get("embarcadorCnpj");
  const transportadora = searchParams.get("transportadora");
  const motivoBaixa = searchParams.get("motivoBaixa");
  const diasMin = searchParams.get("diasMin");
  const dataInicio = searchParams.get("dataInicio");
  const dataFim = searchParams.get("dataFim");
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 100);

  const where: any = {};
  if (status !== "TODOS") where.status = status;
  if (tipoEntrada) where.tipoEntrada = tipoEntrada;
  if (embarcadorCnpj) where.embarcadorCnpj = String(embarcadorCnpj).replace(/\D/g, "");
  if (transportadora) where.transportadora = { contains: transportadora, mode: "insensitive" };
  if (motivoBaixa) where.motivoBaixa = motivoBaixa;
  if (q) {
    where.OR = [
      { codigo: { contains: q, mode: "insensitive" } },
      { notaNumero: { contains: q, mode: "insensitive" } },
      { descricao: { contains: q, mode: "insensitive" } },
      { embarcadorRazao: { contains: q, mode: "insensitive" } },
      { localizacao: { contains: q, mode: "insensitive" } },
      { transportadora: { contains: q, mode: "insensitive" } },
    ];
  }

  // diasMin filtra em SQL (bate no indice [status, dataEntrada]), nunca em JS.
  const dataEntradaFiltro: { gte?: Date; lte?: Date } = {};
  if (diasMin) {
    const n = parseInt(diasMin, 10);
    if (!isNaN(n)) dataEntradaFiltro.lte = new Date(Date.now() - n * 86400000);
  }
  if (dataInicio) dataEntradaFiltro.gte = parseDate(dataInicio);
  if (dataFim) dataEntradaFiltro.lte = parseDate(dataFim, true);
  if (Object.keys(dataEntradaFiltro).length) where.dataEntrada = dataEntradaFiltro;

  // Ordem por dataEntrada asc: e uma fila de atencao (quem esta parado ha
  // mais tempo aparece primeiro), nao um feed de "criado recentemente".
  const [itens, total] = await Promise.all([
    prisma.depositoItem.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { dataEntrada: "asc" },
      include: { registradoPor: { select: { name: true } } },
    }),
    prisma.depositoItem.count({ where }),
  ]);

  const items = itens.map((item) => ({
    ...item,
    diasParados: diasParados(item.dataEntrada, item.dataSaida),
    saldo: item.volumes - item.volumesBaixados,
  }));

  return NextResponse.json({ items, total, pages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { tipoEntrada, embarcadorCnpj, embarcadorRazao, descricao, volumes, dataEntrada } = body;

  if (!tipoEntrada || !embarcadorCnpj || !embarcadorRazao || !descricao || !dataEntrada) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }
  const volumesNum = Number(volumes);
  // Item com 0 volumes deixa o relatorio semanal inutil — recusa aqui, nao so
  // no formulario.
  if (!Number.isFinite(volumesNum) || volumesNum < 1) {
    return NextResponse.json({ error: "Volumes deve ser no mínimo 1" }, { status: 400 });
  }

  const criado = await prisma.$transaction(async (tx) => {
    const item = await tx.depositoItem.create({
      data: {
        codigo: await proximoCodigoDeposito(tx),
        tipoEntrada,
        embarcadorCnpj: String(embarcadorCnpj).replace(/\D/g, ""),
        embarcadorRazao,
        descricao,
        volumes: volumesNum,
        pesoKg: body.pesoKg !== undefined ? Number(body.pesoKg) : undefined,
        valorMercadoria: body.valorMercadoria !== undefined ? Number(body.valorMercadoria) : undefined,
        localizacao: body.localizacao || null,
        transportadora: body.transportadora?.trim() || null,
        notaNumero: body.notaNumero || null,
        notaSerie: body.notaSerie || null,
        notaChave: body.notaChave || null,
        observacoes: body.observacoes || null,
        dataEntrada: new Date(dataEntrada),
        origem: "MANUAL",
        registradoPorId: auth.user.id,
      },
    });

    // Entrada de abertura no livro-razao: o relatorio mensal le entradas daqui,
    // nao do dataEntrada do item.
    await tx.depositoMovimento.create({
      data: {
        itemId: item.id,
        tipo: "ENTRADA",
        volumes: volumesNum,
        usuarioId: auth.user.id,
      },
    });

    return item;
  });

  await logFromRequest(req, "OUTRO", {
    user: { id: auth.user.id, email: auth.user.email, name: auth.user.nome, role: auth.user.role },
    recursoTipo: "deposito",
    recursoId: criado.id,
    recursoDesc: criado.codigo,
    detalhes: { acao: "criar" },
  });

  return NextResponse.json(criado, { status: 201 });
}
