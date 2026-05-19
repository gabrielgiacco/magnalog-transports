import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  if (!["ADMIN", "FINANCEIRO"].includes(user.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const pendente = searchParams.get("pendente") === "true";
  const search = searchParams.get("cliente");
  const dataInicio = searchParams.get("dataInicio");
  const dataFim = searchParams.get("dataFim");
  const aba = searchParams.get("aba") || "acertos"; // "acertos" ou "previsao"

  // Filter for Direct Deliveries (no rota)
  const whereEntrega: any = { 
    rotaId: null,
    status: { notIn: ["PROGRAMADO", "EM_SEPARACAO"] } 
  };
  
  if (aba === "previsao") {
    whereEntrega.dataPagamentoSaldo = { not: null };
  } else if (pendente) {
    whereEntrega.saldoMotorista = { gt: 0 };
  }
  
  if (dataInicio || dataFim) {
    whereEntrega.createdAt = {};
    if (dataInicio) whereEntrega.createdAt.gte = new Date(dataInicio);
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      whereEntrega.createdAt.lte = fim;
    }
  }
  if (search) {
    whereEntrega.OR = [
      { motorista: { nome: { contains: search, mode: "insensitive" } } },
      { notas: { some: { numero: { contains: search } } } }
    ];
  }

  // Filter for Routes
  const whereRota: any = {
    status: { notIn: ["CANCELADA"] }
  };
  
  if (aba === "previsao") {
    whereRota.dataPagamentoSaldo = { not: null };
  } else if (pendente) {
    whereRota.saldoMotorista = { gt: 0 };
  }

  if (dataInicio || dataFim) {
    whereRota.createdAt = {};
    if (dataInicio) whereRota.createdAt.gte = new Date(dataInicio);
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      whereRota.createdAt.lte = fim;
    }
  }
  if (search) {
    whereRota.OR = [
      { motorista: { nome: { contains: search, mode: "insensitive" } } },
      { entregas: { some: { notas: { some: { numero: { contains: search } } } } } }
    ];
  }

  const [entregasDiretas, rotas] = await Promise.all([
    prisma.entrega.findMany({
      where: whereEntrega,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, codigo: true, razaoSocial: true, cidade: true, status: true,
        valorMotorista: true, valorSaida: true, valorDescarga: true, adiantamentoMotorista: true, dataAdiantamento: true,
        descontosMotorista: true, saldoMotorista: true, dataPagamentoSaldo: true, statusCanhoto: true,
        dataEntrega: true, dataAgendada: true,
        motoristaId: true, motorista: { select: { nome: true, tipo: true, valorDiaria: true } },
        notas: { select: { numero: true } },
        _count: { select: { notas: true } },
        createdAt: true,
      },
    }),
    prisma.rota.findMany({
      where: whereRota,
      orderBy: { createdAt: "desc" },
      include: {
        motorista: { select: { nome: true, tipo: true, valorDiaria: true } },
        entregas: {
          select: { id: true, codigo: true, razaoSocial: true, cidade: true, notas: { select: { numero: true } } }
        },
        _count: { select: { entregas: true } }
      }
    })
  ]);

  // Combine into a single list
  const viagens: any[] = [
    ...entregasDiretas.map((e: any) => ({
      ...e,
      isRota: false,
      motoristaTipo: e.motorista?.tipo || null,
      motoristaValorDiaria: e.motorista?.valorDiaria || 0,
      dataRef: e.dataAgendada || e.dataEntrega || e.createdAt,
    })),
    ...rotas.map((r: any) => ({
      id: r.id,
      codigo: r.codigo,
      razaoSocial: `Rota Fracionada (${r._count.entregas} entregas)`,
      cidade: Array.from(new Set(r.entregas.map((e: any) => e.cidade).filter(Boolean))).join(", ") || "Múltiplos Destinos",
      status: r.status,
      valorMotorista: r.valorMotorista || 0,
      valorSaida: r.valorSaida || 0,
      valorDescarga: r.valorDescarga || 0,
      adiantamentoMotorista: r.adiantamentoMotorista || 0,
      dataAdiantamento: r.dataAdiantamento,
      descontosMotorista: r.descontosMotorista || 0,
      saldoMotorista: r.saldoMotorista || 0,
      dataPagamentoSaldo: r.dataPagamentoSaldo,
      statusCanhoto: r.statusCanhoto,
      motoristaId: r.motoristaId,
      motorista: r.motorista,
      motoristaTipo: r.motorista?.tipo || null,
      motoristaValorDiaria: r.motorista?.valorDiaria || 0,
      isRota: true,
      rotaEntregas: r.entregas.map((e: any) => ({ codigo: e.codigo, razaoSocial: e.razaoSocial })),
      notas: r.entregas.flatMap((e: any) => e.notas),
      _count: { notas: r.entregas.length },
      dataEntrega: r.data,
      dataRef: r.data || r.createdAt,
      createdAt: r.createdAt,
    }))
  ].sort((a, b) => {
    const dateA = new Date(a.dataEntrega || a.createdAt).getTime();
    const dateB = new Date(b.dataEntrega || b.createdAt).getTime();
    return dateB - dateA;
  });

  // Agrupar DIARIA: apenas uma diária por motorista por dia
  // Mantém todas as viagens visíveis, mas ajusta o valorMotorista das extras para 0
  const diariaVistos = new Map<string, string>(); // chave "motoristaId_YYYY-MM-DD" → codigo da viagem principal
  for (const v of viagens) {
    if (v.motoristaTipo === "DIARIA" && v.motoristaId) {
      const dateStr = v.dataRef ? new Date(v.dataRef).toISOString().slice(0, 10) : "sem-data";
      const key = `${v.motoristaId}_${dateStr}`;
      if (!diariaVistos.has(key)) {
        // Primeira viagem deste motorista nesta data → mantém o valor da diária
        diariaVistos.set(key, v.codigo);
        v.valorMotorista = v.motoristaValorDiaria || v.valorMotorista;
        v.saldoMotorista = v.valorMotorista + (v.valorDescarga || 0) - (v.adiantamentoMotorista || 0) - (v.valorSaida || 0) - (v.descontosMotorista || 0);
        v.isDiariaPrincipal = true;
      } else {
        // Viagem adicional do mesmo dia → valor motorista = 0 (diária já cobrada)
        v.valorMotoristaOriginal = v.valorMotorista;
        v.valorMotoristaOriginal = v.valorMotorista;
        v.valorMotorista = 0;
        v.saldoMotorista = (v.valorDescarga || 0) - (v.adiantamentoMotorista || 0) - (v.valorSaida || 0) - (v.descontosMotorista || 0);
        v.isDiariaExtra = true;
        v.diariaCobradaEm = diariaVistos.get(key);
      }
      v.diariaData = dateStr;
    }
  }

  // Contar saídas (rotas) e entregas diretas separadamente para cada diária
  for (const v of viagens) {
    if (v.isDiariaPrincipal && v.motoristaId) {
      const dateStr = v.diariaData;
      const mesmodia = viagens.filter((x: any) => x.motoristaId === v.motoristaId && x.diariaData === dateStr);
      const rotas = mesmodia.filter((x: any) => x.isRota);
      const diretas = mesmodia.filter((x: any) => !x.isRota);
      // Saídas = quantidade de rotas (cada rota = 1 saída do caminhão)
      // Se não houver rotas, conta as entregas diretas como saídas
      v.diariaQtdSaidas = rotas.length > 0 ? rotas.length : diretas.length;
      v.diariaQtdDiretas = diretas.length;
      v.diariaQtdRotas = rotas.length;
    }
  }

  // Aggregate totals (com valores já ajustados)
  const totais = viagens.reduce((acc: any, v: any) => ({
    valorMotorista: (acc.valorMotorista || 0) + v.valorMotorista,
    adiantamentoMotorista: (acc.adiantamentoMotorista || 0) + (v.adiantamentoMotorista || 0),
    saldoMotorista: (acc.saldoMotorista || 0) + v.saldoMotorista,
    valorSaida: (acc.valorSaida || 0) + (v.valorSaida || 0),
    valorDescarga: (acc.valorDescarga || 0) + (v.valorDescarga || 0),
    descontosMotorista: (acc.descontosMotorista || 0) + (v.descontosMotorista || 0),
  }), {});

  return NextResponse.json({
    entregas: viagens, // maintain key name for frontend compatibility
    total: viagens.length,
    pages: 1, // pagination simplified for unified view
    totais,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  if (!["ADMIN", "FINANCEIRO"].includes(user.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json();
  const { 
    id, 
    isRota,
    adiantamentoMotorista, dataAdiantamento, 
    descontosMotorista, 
    dataPagamentoSaldo, 
    statusCanhoto,
    valorMotorista,
    valorSaida,
    valorDescarga,
    dataFrete
  } = body;

  const model = isRota ? prisma.rota : prisma.entrega;
  const current = await (model as any).findUnique({ where: { id }, include: { motorista: true } });
  if (!current) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  // Compute balance
  const vMotorista = valorMotorista ?? current.valorMotorista ?? 0;
  const vAdiantamento = adiantamentoMotorista ?? current.adiantamentoMotorista ?? 0;
  const vSaida = valorSaida ?? current.valorSaida ?? 0;
  const vDescarga = valorDescarga ?? current.valorDescarga ?? 0;
  const vDescontos = descontosMotorista ?? current.descontosMotorista ?? 0;
  
  const saldoFinalMotorista = vMotorista + vDescarga - vAdiantamento - vSaida - vDescontos;

  // Build update data
  const updateData: any = {
    ...(valorMotorista !== undefined && { valorMotorista }),
    ...(valorSaida !== undefined && { valorSaida }),
    ...(valorDescarga !== undefined && { valorDescarga }),
    ...(adiantamentoMotorista !== undefined && { adiantamentoMotorista }),
    ...(dataAdiantamento !== undefined && { dataAdiantamento: dataAdiantamento ? new Date(dataAdiantamento) : null }),
    ...(descontosMotorista !== undefined && { descontosMotorista }),
    ...(dataPagamentoSaldo !== undefined && { dataPagamentoSaldo: dataPagamentoSaldo ? new Date(dataPagamentoSaldo) : null }),
    ...(statusCanhoto !== undefined && { statusCanhoto }),
    saldoMotorista: saldoFinalMotorista,
  };

  // Update date if changed
  if (dataFrete !== undefined && dataFrete) {
    if (isRota) {
      updateData.data = new Date(dataFrete);
    } else {
      updateData.dataAgendada = new Date(dataFrete);
    }
  }

  const result = await (model as any).update({
    where: { id },
    data: updateData,
  });

  // If date changed on a route, also update dataAgendada on all linked deliveries
  if (dataFrete && isRota) {
    await prisma.entrega.updateMany({
      where: { rotaId: id },
      data: { dataAgendada: new Date(dataFrete) },
    });
  }

  // ERP Sync: Auto-generate/Update Lancamentos Financeiros
  try {
    const motoristaNome = current.motorista?.nome || "Motorista";
    
    // Find category for Frota
    const catFrota = await prisma.categoriaFinanceira.findFirst({
      where: { nome: "Frota / Terceiros" },
      include: { subcategorias: true }
    });

    if (catFrota) {
      const getSub = (name: string) => catFrota.subcategorias.find(s => s.nome === name)?.id || null;

      const syncLancamento = async (
        desc: string, 
        val: number, 
        dtPg: Date | null, 
        subName: string, 
        extraDesc: string = ""
      ) => {
        if (val <= 0 && !dtPg) return; // Only sync if there is a value
        const subId = getSub(subName);
        
        // Find existing
        const existing = await prisma.lancamentoFinanceiro.findFirst({
          where: {
            descricao: { startsWith: desc },
            ...(isRota ? { rotaId: id } : { entregaId: id })
          }
        });

        const data = {
          descricao: `${desc} ${extraDesc}`,
          tipo: "DESPESA" as const,
          valor: val,
          dataVencimento: current.data || current.dataEntrega || current.createdAt,
          dataPagamento: dtPg,
          status: dtPg ? ("PAGO" as const) : ("PENDENTE" as const),
          categoriaId: catFrota.id,
          subcategoriaId: subId,
          favorecido: motoristaNome,
          ...(isRota ? { rotaId: id } : { entregaId: id })
        };

        if (existing) {
          await prisma.lancamentoFinanceiro.update({ where: { id: existing.id }, data });
        } else if (val > 0) {
          await prisma.lancamentoFinanceiro.create({ data });
        }
      };

      // 1. Pagamento Saldo Motorista
      if (saldoFinalMotorista > 0 || dataPagamentoSaldo) {
         await syncLancamento("Acerto Motorista -", saldoFinalMotorista, dataPagamentoSaldo ? new Date(dataPagamentoSaldo) : null, "Pagamento Motorista", current.codigo);
      }

      // 2. Adiantamento Motorista
      if (vAdiantamento > 0 || dataAdiantamento) {
         await syncLancamento("Adiantamento Motorista -", vAdiantamento, dataAdiantamento ? new Date(dataAdiantamento) : null, "Adiantamento Motorista", current.codigo);
      }

      // 3. Descarga
      const vDescarga = valorDescarga ?? current.valorDescarga;
      if (vDescarga > 0) {
         await syncLancamento("Descarga -", vDescarga, dataPagamentoSaldo ? new Date(dataPagamentoSaldo) : null, "Descarga (Chapa)", current.codigo);
      }
      
      // 4. Saída / Pedágio
      if (vSaida > 0) {
         await syncLancamento("Saída/Pedágio -", vSaida, dataPagamentoSaldo ? new Date(dataPagamentoSaldo) : null, "Vale / Pedágio", current.codigo);
      }
    }
  } catch (e) {
    console.error("Erro ao sincronizar ERP financeiro", e);
  }

  return NextResponse.json(result);
}
