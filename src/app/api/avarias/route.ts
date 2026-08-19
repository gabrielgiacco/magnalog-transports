import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

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
    if (entregaId) where.entregaId = entregaId;

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
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const user = session.user as any;
    const userId = user.id || user.userId;
    const body = await req.json();

    // Generate sequential code
    const count = await prisma.avaria.count();
    const codigo = `AVR-${String(count + 1).padStart(5, "0")}`;

    // Calculate total damage from products
    const produtos = body.produtos || [];
    const valorPrejuizo = body.valorPrejuizo ??
      produtos.reduce((s: number, p: any) => s + (p.quantidadeAvaria * p.valorUnitario), 0);

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
