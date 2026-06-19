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
    const cliente = searchParams.get("cliente");
    const rotaId = searchParams.get("rotaId");
    const mostrarFinalizados = searchParams.get("mostrarFinalizados") === "true";
    const dataInicio = searchParams.get("dataInicio");
    const dataFim = searchParams.get("dataFim");
    const apenasAgendadas = searchParams.get("apenasAgendadas") === "true";
    const atrasadas = searchParams.get("atrasadas") === "true";
    const sortBy = searchParams.get("sortBy");
    const sortOrder = searchParams.get("sortOrder") as "asc" | "desc" | null;

    // Multi-value dynamic filters — getAll() captures all values for the same param
    const cidades = searchParams.getAll("cidade").filter(Boolean);
    const statusList = searchParams.getAll("status").filter(Boolean);
    const clienteNomes = searchParams.getAll("clienteNome").filter(Boolean);
    const fornecedores = searchParams.getAll("fornecedor").filter(Boolean);
    const nfs = searchParams.getAll("nf").filter(Boolean);
    const anotacoesNfs = searchParams.getAll("anotacoesNf").filter(Boolean);
    const volumes = searchParams.getAll("volume").filter(Boolean);
    const ufs = searchParams.getAll("uf").filter(Boolean);
    const motoristas = searchParams.getAll("motorista").filter(Boolean);
    const enderecos = searchParams.getAll("endereco").filter(Boolean);

    const where: any = {};
    // AND array to combine multiple filter groups
    const andConditions: any[] = [];

    // Filtro especial: entregas atrasadas (dataAgendada < hoje e não entregues)
    if (atrasadas) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      where.dataAgendada = { lt: hoje };
      where.status = { notIn: ["ENTREGUE", "FINALIZADO"] };
    }
    // Ocultar finalizados por padrão
    else if (!mostrarFinalizados) {
      where.status = { notIn: ["FINALIZADO"] };
    }

    // Excluir entregas com todas as ocorrências resolvidas da listagem principal
    andConditions.push({
      NOT: {
        AND: [
          { ocorrencias: { some: {} } },
          { ocorrencias: { none: { resolvida: false } } }
        ]
      }
    });

    // Status filter: multiple values → OR (show any matching status)
    if (statusList.length === 1) {
      where.status = statusList[0];
    } else if (statusList.length > 1) {
      where.status = { in: statusList };
    }

    // Global search bar (searches across many fields)
    if (cliente) {
      const orConditions: any[] = [
        { razaoSocial: { contains: cliente, mode: "insensitive" } },
        { cidade: { contains: cliente, mode: "insensitive" } },
        { endereco: { contains: cliente, mode: "insensitive" } },
        { bairro: { contains: cliente, mode: "insensitive" } },
        { cep: { contains: cliente, mode: "insensitive" } },
        { codigo: { contains: cliente, mode: "insensitive" } },
        { notas: { some: { numero: { contains: cliente } } } },
        { notas: { some: { emitenteRazao: { contains: cliente, mode: "insensitive" } } } },
        { notas: { some: { chaveAcesso: { contains: cliente } } } },
        { notas: { some: { xmlOriginal: { contains: cliente, mode: "insensitive" } } } },
        { motorista: { nome: { contains: cliente, mode: "insensitive" } } },
        { rota: { codigo: { contains: cliente, mode: "insensitive" } } },
      ];
      const digits = cliente.replace(/\D/g, "");
      if (digits.length > 0) orConditions.push({ cnpj: { contains: digits } });
      andConditions.push({ OR: orConditions });
    }

    // Cidade filter: multiple values → OR (show entries in ANY of the cities)
    if (cidades.length === 1) {
      andConditions.push({ cidade: { contains: cidades[0], mode: "insensitive" } });
    } else if (cidades.length > 1) {
      andConditions.push({
        OR: cidades.map((c) => ({ cidade: { contains: c, mode: "insensitive" } })),
      });
    }

    // Cliente/Razão Social filter: multiple values → OR
    if (clienteNomes.length === 1) {
      andConditions.push({ razaoSocial: { contains: clienteNomes[0], mode: "insensitive" } });
    } else if (clienteNomes.length > 1) {
      andConditions.push({
        OR: clienteNomes.map((n) => ({ razaoSocial: { contains: n, mode: "insensitive" } })),
      });
    }

    // Fornecedor filter: multiple values → OR
    if (fornecedores.length === 1) {
      andConditions.push({ notas: { some: { emitenteRazao: { contains: fornecedores[0], mode: "insensitive" } } } });
    } else if (fornecedores.length > 1) {
      andConditions.push({
        OR: fornecedores.map((f) => ({ notas: { some: { emitenteRazao: { contains: f, mode: "insensitive" } } } })),
      });
    }

    // NF filter (número da nota): multiple values → OR
    if (nfs.length === 1) {
      andConditions.push({ notas: { some: { numero: { contains: nfs[0] } } } });
    } else if (nfs.length > 1) {
      andConditions.push({
        OR: nfs.map((nf) => ({ notas: { some: { numero: { contains: nf } } } })),
      });
    }

    // Anotações da NF filter: multiple values → OR
    if (anotacoesNfs.length === 1) {
      andConditions.push({ notas: { some: { xmlOriginal: { contains: anotacoesNfs[0], mode: "insensitive" } } } });
    } else if (anotacoesNfs.length > 1) {
      andConditions.push({
        OR: anotacoesNfs.map((anotacao) => ({ notas: { some: { xmlOriginal: { contains: anotacao, mode: "insensitive" } } } })),
      });
    }

    // Volume filter: multiple values → OR
    if (volumes.length === 1) {
      andConditions.push({ volumeTotal: parseInt(volumes[0]) });
    } else if (volumes.length > 1) {
      andConditions.push({
        OR: volumes.map((v) => ({ volumeTotal: parseInt(v) })),
      });
    }

    // UF filter: multiple values → OR
    if (ufs.length === 1) {
      andConditions.push({ uf: { equals: ufs[0], mode: "insensitive" } });
    } else if (ufs.length > 1) {
      andConditions.push({
        OR: ufs.map((u) => ({ uf: { equals: u, mode: "insensitive" } })),
      });
    }

    // Motorista filter: multiple values → OR
    if (motoristas.length === 1) {
      andConditions.push({ motorista: { nome: { contains: motoristas[0], mode: "insensitive" } } });
    } else if (motoristas.length > 1) {
      andConditions.push({
        OR: motoristas.map((m) => ({ motorista: { nome: { contains: m, mode: "insensitive" } } })),
      });
    }

    // Endereço filter: multiple values → OR
    if (enderecos.length === 1) {
      andConditions.push({ endereco: { contains: enderecos[0], mode: "insensitive" } });
    } else if (enderecos.length > 1) {
      andConditions.push({
        OR: enderecos.map((e) => ({ endereco: { contains: e, mode: "insensitive" } })),
      });
    }

    if (rotaId) where.rotaId = rotaId;
    
    if (apenasAgendadas) {
      where.dataAgendada = { not: null };
    }

    if (dataInicio || dataFim) {
      const dateField = apenasAgendadas ? "dataAgendada" : "createdAt";
      where[dateField] = { ...(where[dateField] || {}) };
      if (dataInicio) where[dateField].gte = new Date(dataInicio);
      if (dataFim) {
        where[dateField].lte = new Date(dataFim);
      }
    }

    // Combine all dynamic filter conditions with AND
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    // Ordenação dinâmica: suporta colunas diretas e relações (motorista.nome)
    const SORT_MAP: Record<string, any> = {
      codigo: { codigo: sortOrder },
      razaoSocial: { razaoSocial: sortOrder },
      cidade: { cidade: sortOrder },
      volumeTotal: { volumeTotal: sortOrder },
      pesoTotal: { pesoTotal: sortOrder },
      motorista: { motorista: { nome: sortOrder } },
      dataChegada: { dataChegada: sortOrder },
      dataAgendada: { dataAgendada: sortOrder },
      status: { status: sortOrder },
      valorFrete: { valorFrete: sortOrder },
    };
    const orderBy = (sortBy && sortOrder && SORT_MAP[sortBy]) ? SORT_MAP[sortBy] : { createdAt: "desc" as const };

    const [entregas, total] = await Promise.all([
      prisma.entrega.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          motorista: { select: { id: true, nome: true } },
          veiculo: { select: { id: true, placa: true, tipo: true } },
          rota: { select: { id: true, codigo: true } },
          notas: { select: { id: true, numero: true, chaveAcesso: true, valorNota: true, volumes: true, pesoBruto: true, emitenteRazao: true } },
          _count: { select: { notas: true, ocorrencias: true } },
          qualidade: { select: { id: true } },
        },
      }),
      prisma.entrega.count({ where }),
    ]);

    return NextResponse.json({ entregas, total, pages: Math.ceil(total / limit) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const count = await prisma.entrega.count();
    const codigo = `SEM-NF-${String(count + 1).padStart(3, '0')}`;

    // Upsert cliente
    if (body.cnpj) {
      await prisma.cliente.upsert({
        where: { cnpj: body.cnpj },
        update: { razaoSocial: body.razaoSocial },
        create: { cnpj: body.cnpj, razaoSocial: body.razaoSocial },
      });
    }

    const entrega = await prisma.entrega.create({
      data: {
        codigo,
        cnpj: body.cnpj,
        razaoSocial: body.razaoSocial,
        cidade: body.cidade,
        uf: body.uf,
        endereco: body.endereco,
        bairro: body.bairro,
        cep: body.cep,
        dataChegada: body.dataChegada ? new Date(body.dataChegada) : null,
        dataAgendada: body.dataAgendada ? new Date(body.dataAgendada) : null,
        motoristaId: body.motoristaId || null,
        veiculoId: body.veiculoId || null,
        rotaId: body.rotaId || null,
        pesoTotal: body.pesoTotal || 0,
        volumeTotal: body.volumeTotal || 0,
        quantidadePaletes: body.quantidadePaletes || 0,
        status: body.status || "PROGRAMADO",
        observacoes: body.observacoes,
        valorFrete: body.valorFrete || 0,
        valorDescarga: body.valorDescarga || 0,
        valorArmazenagem: body.valorArmazenagem || 0,
        adiantamento: body.adiantamento || 0,
        saldoPendente: (body.valorFrete || 0) - (body.adiantamento || 0),
        
        // Motorista Principal Financeiro
        valorMotorista: body.valorMotorista || 0,
        valorSaida: body.valorSaida || 0,
        adiantamentoMotorista: body.adiantamentoMotorista || 0,
        descontosMotorista: body.descontosMotorista || 0,
        saldoMotorista: (body.valorMotorista || 0) + (body.valorDescarga || 0) - (body.adiantamentoMotorista || 0) - (body.valorSaida || 0) - (body.descontosMotorista || 0),
        dataAdiantamento: body.dataAdiantamento ? new Date(body.dataAdiantamento) : null,
        dataPagamentoSaldo: body.dataPagamentoSaldo ? new Date(body.dataPagamentoSaldo) : null,
        statusCanhoto: body.statusCanhoto || "PENDENTE",

        // Motorista Complementar Financeiro
        motoristaComplId: body.motoristaComplId || null,
        veiculoComplId: body.veiculoComplId || null,
        valorMotoristaCompl: body.valorMotoristaCompl || 0,
        valorSaidaCompl: body.valorSaidaCompl || 0,
        adiantamentoMotoristaCompl: body.adiantamentoMotoristaCompl || 0,
        descontosMotoristaCompl: body.descontosMotoristaCompl || 0,
        saldoMotoristaCompl: (body.valorMotoristaCompl || 0) - (body.adiantamentoMotoristaCompl || 0) - (body.valorSaidaCompl || 0) - (body.descontosMotoristaCompl || 0),
        dataAdiantamentoCompl: body.dataAdiantamentoCompl ? new Date(body.dataAdiantamentoCompl) : null,
        dataPagamentoSaldoCompl: body.dataPagamentoSaldoCompl ? new Date(body.dataPagamentoSaldoCompl) : null,
        statusCanhotoCompl: body.statusCanhotoCompl || "PENDENTE",
      },
      include: {
        motorista: true,
        veiculo: true,
        motoristaCompl: true,
        veiculoCompl: true,
        notas: true,
      },
    });

    return NextResponse.json(entrega, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
