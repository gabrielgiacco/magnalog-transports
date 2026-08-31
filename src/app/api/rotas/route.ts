import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { generateCodigoRota } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const nfFilter = searchParams.get("nf");
  const motoristaFilter = searchParams.get("motorista");
  const mostrarFinalizadas = searchParams.get("mostrarFinalizadas") === "true";

  const where: any = {};
  // Por padrão a lista mostra só o que ainda está em aberto (planejada / em
  // andamento). Um filtro de status explícito continua tendo precedência.
  if (status) where.status = status;
  else if (!mostrarFinalizadas) where.status = { notIn: ["CONCLUIDA", "CANCELADA"] };
  if (nfFilter) {
    where.entregas = { some: { notas: { some: { numero: { contains: nfFilter, mode: "insensitive" } } } } };
  }
  if (motoristaFilter) {
    where.motorista = { nome: { contains: motoristaFilter, mode: "insensitive" } };
  }

  const rotas = await prisma.rota.findMany({
    where,
    orderBy: { data: "desc" },
    include: {
      motorista: { select: { id: true, nome: true } },
      veiculo: { select: { id: true, placa: true, tipo: true } },
      entregas: {
        select: { id: true, codigo: true, razaoSocial: true, cidade: true, status: true, pesoTotal: true, volumeTotal: true, valorFrete: true, notas: { select: { numero: true } } },
      },
      _count: { select: { entregas: true } },
      qualidade: { select: { id: true } },
    },
  });

  return NextResponse.json(rotas);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const body = await req.json();

    // Novo cálculo de código robusto (evita duplicatas se rotas forem excluídas)
    const lastRota = await prisma.rota.findFirst({
      orderBy: { codigo: "desc" },
    });
    
    let nextNum = 1;
    if (lastRota?.codigo) {
      const match = lastRota.codigo.match(/\d+/);
      if (match) nextNum = parseInt(match[0]) + 1;
    }
    const codigo = generateCodigoRota(nextNum);

    // Calcular totais das entregas se fornecidas
    let pesoTotal = 0;
    let volumeTotal = 0;
    if (body.entregaIds?.length) {
      const entregas = await prisma.entrega.findMany({
        where: { id: { in: body.entregaIds } },
        select: { pesoTotal: true, volumeTotal: true },
      });
      pesoTotal = entregas.reduce((s: number, e: any) => s + (e.pesoTotal || 0), 0);
      volumeTotal = entregas.reduce((s: number, e: any) => s + (e.volumeTotal || 0), 0);
    }

    let resolvedValorMotorista = parseFloat(String(body.valorMotorista).replace(",", ".")) || 0;

    if ((!body.valorMotorista || resolvedValorMotorista === 0) && body.motoristaId) {
      const moto = await prisma.motorista.findUnique({ where: { id: body.motoristaId }, select: { tipo: true, valorDiaria: true } });
      if (moto) {
        if (moto.tipo === "FROTA") resolvedValorMotorista = 0;
        else if (moto.tipo === "DIARIA") {
          // Verificar se já existe outra rota ou entrega direta para este motorista na mesma data
          const rotaDate = body.data ? new Date(body.data) : new Date();
          const diaInicio = new Date(rotaDate); diaInicio.setHours(0,0,0,0);
          const diaFim = new Date(rotaDate); diaFim.setHours(23,59,59,999);
          const [rotasMesmoDia, entregasMesmoDia] = await Promise.all([
            prisma.rota.count({ where: { motoristaId: body.motoristaId, data: { gte: diaInicio, lte: diaFim }, status: { not: "CANCELADA" } } }),
            prisma.entrega.count({ where: { motoristaId: body.motoristaId, rotaId: null, dataAgendada: { gte: diaInicio, lte: diaFim }, status: { notIn: ["PROGRAMADO", "EM_SEPARACAO"] } } }),
          ]);
          resolvedValorMotorista = (rotasMesmoDia + entregasMesmoDia) === 0 ? (moto.valorDiaria || 0) : 0;
        }
      }
    }

    const rota = await prisma.rota.create({
      data: {
        codigo,
        data: body.data ? new Date(body.data) : new Date(),
        motoristaId: body.motoristaId || null,
        veiculoId: body.veiculoId || null,
        pesoTotal,
        volumeTotal: Math.round(volumeTotal), // Garante que seja Int
        valorMotorista: resolvedValorMotorista,
        observacoes: body.observacoes,
        status: "PLANEJADA",
      },
    });

    // Associar entregas à rota e propagar dados
    if (body.entregaIds?.length) {
      await prisma.entrega.updateMany({
        where: { id: { in: body.entregaIds } },
        data: { 
          rotaId: rota.id,
          motoristaId: rota.motoristaId,
          veiculoId: rota.veiculoId,
          valorMotorista: rota.valorMotorista,
          status: "CARREGADO"
        },
      });
    }

    return NextResponse.json(rota, { status: 201 });
  } catch (error: any) {
    console.error("ERRO_CRIAR_ROTA:", error);
    return NextResponse.json({ 
      error: "Erro interno ao criar rota", 
      details: error.message,
      code: error.code // Prisma error codes
    }, { status: 500 });
  }
}
