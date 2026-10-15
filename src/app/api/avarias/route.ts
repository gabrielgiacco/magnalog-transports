import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { calcularPrejuizo } from "@/lib/avaria-prejuizo";
import { avariasDaEntrega } from "@/lib/avaria-entrega";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApi();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;
    const tipo = searchParams.get("tipo");
    const fase = searchParams.get("fase");
    const status = searchParams.get("status");
    const motoristaId = searchParams.get("motoristaId");
    const entregaId = searchParams.get("entregaId");
    const dataInicio = searchParams.get("dataInicio");
    const dataFim = searchParams.get("dataFim");
    const q = searchParams.get("q");

    const where: any = {};

    if (tipo) where.tipo = tipo;
    if (fase) where.fase = fase;
    if (status) where.status = status;
    if (motoristaId) where.motoristaId = motoristaId;
    // Avarias da entrega pelo vinculo direto ou por qualquer NF dela (declaracao
    // que cobre NFs de mais de uma entrega aparece em todas elas)
    if (entregaId) where.AND = [avariasDaEntrega(entregaId)];

    if (dataInicio || dataFim) {
      where.dataOcorrencia = {};
      if (dataInicio) where.dataOcorrencia.gte = new Date(dataInicio);
      if (dataFim) where.dataOcorrencia.lte = new Date(dataFim);
    }

    if (q) {
      // A NF de uma avaria mora em quatro lugares conforme a origem: FK direta,
      // notas da entrega, NF por linha de produto (declaracao) e notas de
      // devolucao. Buscar so a FK direta perde a maioria dos casos.
      where.OR = [
        { codigo: { contains: q, mode: "insensitive" } },
        { descricao: { contains: q, mode: "insensitive" } },
        { entrega: { razaoSocial: { contains: q, mode: "insensitive" } } },
        { motorista: { nome: { contains: q, mode: "insensitive" } } },
        { notaFiscal: { numero: { contains: q } } },
        { entrega: { notas: { some: { numero: { contains: q } } } } },
        { produtos: { some: { notaFiscal: { numero: { contains: q } } } } },
        { devolucoes: { some: { numero: { contains: q } } } },
        // Produto afetado (codigo ou nome), incluindo o que veio no lugar numa inversao
        { produtos: { some: { codigoProduto: { contains: q, mode: "insensitive" } } } },
        { produtos: { some: { descricao: { contains: q, mode: "insensitive" } } } },
        { produtos: { some: { invertidoCodigo: { contains: q, mode: "insensitive" } } } },
        { produtos: { some: { invertidoDescricao: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const [avarias, total] = await Promise.all([
      prisma.avaria.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          entrega: {
            select: {
              id: true, codigo: true, razaoSocial: true, cidade: true,
              notas: { select: { numero: true } },
            },
          },
          notaFiscal: { select: { id: true, numero: true, emitenteRazao: true } },
          devolucoes: { select: { numero: true } },
          motorista: { select: { id: true, nome: true } },
          rota: { select: { id: true, codigo: true } },
          registradoPor: { select: { id: true, name: true } },
          _count: { select: { produtos: true, devolucoes: true } },
        },
      }),
      prisma.avaria.count({ where }),
    ]);

    return NextResponse.json({ avarias, total, pages: Math.ceil(total / limit) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApi();
    if (!auth.ok) return auth.response;
    const session = auth.session;

    const user = session.user as any;
    const userId = user.id || user.userId;
    const body = await req.json();

    // Generate sequential code
    const count = await prisma.avaria.count();
    const codigo = `AVR-${String(count + 1).padStart(5, "0")}`;

    // Calculate total damage from products
    const produtos = body.produtos || [];

    // Toda linha de inversao precisa dizer o que veio no lugar
    if (produtos.some((p: any) => p.tipoDivergencia === "INVERSAO" && !String(p.invertidoDescricao || "").trim())) {
      return NextResponse.json(
        { error: "Informe o item que veio no lugar em toda linha de inversão" },
        { status: 400 },
      );
    }

    // So falta e avaria contam como prejuizo (ver avaria-prejuizo.ts)
    const valorPrejuizo = body.valorPrejuizo ??
      calcularPrejuizo(
        body.tipo,
        produtos.map((p: any) => ({
          tipoDivergencia: p.tipoDivergencia,
          valorTotal: (p.quantidadeAvaria || 0) * (p.valorUnitario || 0),
        })),
      );

    const avaria = await prisma.avaria.create({
      data: {
        codigo,
        tipo: body.tipo,
        fase: body.fase,
        entregaId: body.entregaId || null,
        notaFiscalId: body.notaFiscalId || null,
        motoristaId: body.motoristaId || null,
        rotaId: body.rotaId || null,
        descricao: body.descricao,
        observacoes: body.observacoes || null,
        valorPrejuizo,
        registradoPorId: userId,
        dataOcorrencia: new Date(body.dataOcorrencia),
        localOcorrencia: body.localOcorrencia || null,
        dataChegada: body.dataChegada ? new Date(body.dataChegada) : null,
        transportadoraChegada: body.transportadoraChegada || null,
        motoristaChegada: body.motoristaChegada || null,
        motoristaCpfChegada: body.motoristaCpfChegada || null,
        placaChegada: body.placaChegada || null,
        produtos: {
          create: produtos.map((p: any) => ({
            codigoProduto: p.codigoProduto,
            descricao: p.descricao,
            ncm: p.ncm || null,
            unidade: p.unidade || null,
            quantidadeNF: p.quantidadeNF,
            quantidadeAvaria: p.quantidadeAvaria,
            valorUnitario: p.valorUnitario || 0,
            valorTotal: (p.quantidadeAvaria || 0) * (p.valorUnitario || 0),
            tipoDivergencia: p.tipoDivergencia || null,
            notaFiscalId: p.notaFiscalId || null,
            // Item que veio no lugar (so inversao)
            invertidoCodigo: p.tipoDivergencia === "INVERSAO" ? String(p.invertidoCodigo || "").trim() || null : null,
            invertidoDescricao: p.tipoDivergencia === "INVERSAO" ? String(p.invertidoDescricao || "").trim() || null : null,
            invertidoQuantidade:
              p.tipoDivergencia === "INVERSAO" && p.invertidoQuantidade != null && p.invertidoQuantidade !== ""
                ? Number(p.invertidoQuantidade)
                : null,
          })),
        },
      },
      include: {
        entrega: { select: { id: true, codigo: true, razaoSocial: true } },
        motorista: { select: { id: true, nome: true } },
        produtos: true,
      },
    });

    return NextResponse.json(avaria, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
