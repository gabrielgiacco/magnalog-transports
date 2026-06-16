import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sessionUser = session.user as any;

  // Buscar fornecedores autorizados para o usuário
  const autorizados = await prisma.fornecedorAutorizado.findMany({
    where: { userId: sessionUser.id },
    select: { cnpjEmitente: true },
  });

  if (!autorizados.length) {
    return NextResponse.json({ notas: [], mensagem: "Nenhum fornecedor autorizado para visualização." });
  }

  const cnpjs = autorizados.map((a: any) => a.cnpjEmitente);

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 50;
  const skip = (page - 1) * limit;
  const busca = searchParams.get("numero");
  const status = searchParams.get("status");
  const emitente = searchParams.get("emitente");
  const cidade = searchParams.get("cidade");
  const dataEmissao = searchParams.get("dataEmissao");
  const destinatario = searchParams.get("destinatario");
  const volumes = searchParams.get("volumes");
  const peso = searchParams.get("peso");
  const dataAgendada = searchParams.get("dataAgendada");
  const dataChegada = searchParams.get("dataChegada");
  const dataEntrega = searchParams.get("dataEntrega");


  const where: any = {
    emitenteCnpj: { in: cnpjs },
  };

  if (emitente) {
    where.emitenteRazao = { contains: emitente, mode: "insensitive" };
  }

  if (cidade) {
    where.cidade = { contains: cidade, mode: "insensitive" };
  }

  if (destinatario) {
    where.destinatarioRazao = { contains: destinatario, mode: "insensitive" };
  }

  if (volumes) {
    const vVal = parseInt(volumes);
    if (!isNaN(vVal)) {
      where.volumes = vVal;
    }
  }

  if (peso) {
    const pVal = parseFloat(peso);
    if (!isNaN(pVal)) {
      where.pesoBruto = pVal;
    }
  }

  if (dataEmissao) {
    const start = new Date(dataEmissao);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(dataEmissao);
    end.setUTCHours(23, 59, 59, 999);
    where.dataEmissao = { gte: start, lte: end };
  }


  if (busca) {
    const orConditions: any[] = [
      { numero: { contains: busca } },
      { destinatarioRazao: { contains: busca, mode: "insensitive" } },
      { emitenteRazao: { contains: busca, mode: "insensitive" } },
      { cidade: { contains: busca, mode: "insensitive" } },
      { endereco: { contains: busca, mode: "insensitive" } },
      { bairro: { contains: busca, mode: "insensitive" } },
      { cep: { contains: busca, mode: "insensitive" } },
      { chaveAcesso: { contains: busca } },
    ];
    const digits = busca.replace(/\D/g, "");
    if (digits.length > 0) {
      orConditions.push({ destinatarioCnpj: { contains: digits } });
    }
    where.OR = orConditions;
  }

  const entregaFilters: any = {};
  if (status) {
    if (status === "FINALIZADAS") {
      entregaFilters.status = { in: ["ENTREGUE", "FINALIZADO"] };
    } else {
      entregaFilters.status = status;
    }
  }

  if (dataAgendada) {
    const start = new Date(dataAgendada);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(dataAgendada);
    end.setUTCHours(23, 59, 59, 999);
    entregaFilters.dataAgendada = { gte: start, lte: end };
  }

  if (dataChegada) {
    const start = new Date(dataChegada);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(dataChegada);
    end.setUTCHours(23, 59, 59, 999);
    entregaFilters.dataChegada = { gte: start, lte: end };
  }

  if (dataEntrega) {
    const start = new Date(dataEntrega);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(dataEntrega);
    end.setUTCHours(23, 59, 59, 999);
    entregaFilters.dataEntrega = { gte: start, lte: end };
  }

  if (Object.keys(entregaFilters).length > 0) {
    where.entrega = entregaFilters;
  }


  const [notas, total] = await Promise.all([
    prisma.notaFiscal.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        entrega: {
          select: {
            id: true,
            codigo: true,
            status: true,
            dataAgendada: true,
            dataChegada: true,
            dataEntrega: true,
            cidade: true,
            notas: { select: { numero: true } },
            motorista: { select: { nome: true } },
            ocorrencias: { select: { tipo: true, descricao: true, resolvida: true, createdAt: true }, orderBy: { createdAt: "desc" as const } },
          },
        },
      },
    }),
    prisma.notaFiscal.count({ where }),
  ]);

  // Remover o filtro de status para o gráfico (para mostrar os totais gerais da busca atual)
  const chartWhere = { ...where };
  delete chartWhere.entrega;

  const [countEmSeparacao, countOcorrencia, countFinalizadas, countEmRota] = await Promise.all([
    prisma.notaFiscal.count({ where: { ...chartWhere, entrega: { status: "EM_SEPARACAO" } } }),
    prisma.notaFiscal.count({ where: { ...chartWhere, entrega: { status: "OCORRENCIA" } } }),
    prisma.notaFiscal.count({ where: { ...chartWhere, entrega: { status: { in: ["ENTREGUE", "FINALIZADO"] } } } }),
    prisma.notaFiscal.count({ where: { ...chartWhere, entrega: { status: "EM_ROTA" } } }),
  ]);

  return NextResponse.json({ 
    notas, 
    total, 
    pages: Math.ceil(total / limit),
    stats: {
      EM_SEPARACAO: countEmSeparacao,
      OCORRENCIA: countOcorrencia,
      FINALIZADAS: countFinalizadas,
      EM_ROTA: countEmRota
    }
  });
}
