import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const dynamic = "force-dynamic";

function dateFilter(inicio: Date, fim: Date) {
  return {
    OR: [
      { dataAgendada: { gte: inicio, lte: fim } },
      { dataAgendada: null, createdAt: { gte: inicio, lte: fim } },
    ],
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo") || "mensal";
  const ano = parseInt(searchParams.get("ano") || String(new Date().getFullYear()));
  const mes = parseInt(searchParams.get("mes") || String(new Date().getMonth() + 1));

  // ─── Relatório Mensal ──────────────────────────────────────────────────────
  if (tipo === "mensal") {
    const inicio = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 0, 23, 59, 59);
    const where = dateFilter(inicio, fim);

    // Batch 1
    const [
      entregasCount,
      porStatus,
      rawPorCidade,
      receitaTotal,
    ] = await Promise.all([
      prisma.entrega.count({ where }),
      prisma.entrega.groupBy({ by: ["status"], where, _count: true }),
      prisma.entrega.groupBy({ by: ["cidade"], where, _count: true }),
      prisma.entrega.aggregate({
        where,
        _sum: { valorFrete: true, pesoTotal: true, volumeTotal: true },
        _avg: { valorFrete: true },
      }),
    ]);

    function formatCityName(str: string) {
      return str.toLowerCase().split(' ').map(word => {
        if (["de", "da", "do", "das", "dos"].includes(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      }).join(' ');
    }

    const cidadeMap = new Map<string, number>();
    for (const item of rawPorCidade) {
      if (!item.cidade) continue;
      const nomeCidade = item.cidade.split(",")[0].trim();
      const normalized = nomeCidade.toUpperCase();
      cidadeMap.set(normalized, (cidadeMap.get(normalized) || 0) + item._count);
    }
    const porCidade = Array.from(cidadeMap.entries())
      .map(([cidade, _count]) => ({ cidade: formatCityName(cidade), _count }))
      .sort((a, b) => b._count - a._count)
      .slice(0, 10);

    // Batch 2
    const [
      finEntregasDiretas,
      finRotas,
      notas,
      volumeAgg,
    ] = await Promise.all([
      prisma.entrega.aggregate({
        where: { ...where, rotaId: null },
        _sum: { valorDescarga: true, valorMotorista: true, adiantamentoMotorista: true, saldoMotorista: true },
      }),
      (prisma.rota as any).aggregate({
        where: { data: { gte: inicio, lte: fim } },
        _sum: { valorDescarga: true, valorMotorista: true, adiantamentoMotorista: true, saldoMotorista: true },
      }),
      prisma.notaFiscal.count({ where: { createdAt: { gte: inicio, lte: fim } } }),
      prisma.entrega.aggregate({ where, _sum: { volumeTotal: true } }),
    ]);

    // Custo motorista total (entregas diretas + rotas)
    const custoMotorista =
      ((finEntregasDiretas._sum as any).valorMotorista || 0) +
      ((finRotas._sum as any).valorMotorista || 0);

    const valorDescargaTotal =
      ((finEntregasDiretas._sum as any).valorDescarga || 0) +
      ((finRotas._sum as any).valorDescarga || 0);

    const adiantamento =
      ((finEntregasDiretas._sum as any).adiantamentoMotorista || 0) +
      ((finRotas._sum as any).adiantamentoMotorista || 0);

    const saldoPendente =
      ((finEntregasDiretas._sum as any).saldoMotorista || 0) +
      ((finRotas._sum as any).saldoMotorista || 0);

    // Armazenagem real (calculada pela tabela do fornecedor)
    let armazenagemTotal = 0;
    try {
      const tabelas = await prisma.tabelaArmazenagem.findMany();
      if (tabelas.length > 0) {
        const cnpjs = tabelas.map((t: any) => t.cnpjCliente);
        const entregasArm = await prisma.entrega.findMany({
          where: { ...where, quantidadePaletes: { gt: 0 }, notas: { some: { emitenteCnpj: { in: cnpjs } } } },
          select: { id: true, quantidadePaletes: true, dataChegada: true, dataEntrega: true, createdAt: true, notas: { select: { emitenteCnpj: true } } },
        });
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        for (const e of entregasArm as any[]) {
          const entrada = e.dataChegada || e.createdAt;
          const saida = e.dataEntrega || hoje;
          const dE = new Date(entrada); dE.setHours(0, 0, 0, 0);
          const dS = new Date(saida); dS.setHours(0, 0, 0, 0);
          const dias = Math.max(0, Math.floor((dS.getTime() - dE.getTime()) / MS_PER_DAY));
          const emitentes = Array.from(new Set((e.notas || []).map((n: any) => n.emitenteCnpj).filter(Boolean)));
          for (const cnpj of emitentes) {
            const tab = tabelas.find((t: any) => t.cnpjCliente === cnpj);
            if (!tab) continue;
            const cobraveis = Math.max(0, dias - (tab.diasFree || 0));
            armazenagemTotal += cobraveis * (tab.valorPaleteDia || 0) * (e.quantidadePaletes || 0);
          }
        }
      }
    } catch {}

    // Armazenagem já faturada no período
    let armazenagemFaturada = 0;
    try {
      const fatArm = await prisma.faturaArmazenagem.findMany({
        where: { dataEmissao: { gte: inicio, lte: fim }, status: { not: "CANCELADA" } },
        select: { valorTotal: true },
      });
      armazenagemFaturada = fatArm.reduce((s: number, f: any) => s + f.valorTotal, 0);
    } catch {}

    // Detalhamento de Descargas (Top 5)
    let detalheDescargas: any[] = [];
    try {
      const [descEntregas, descRotas] = await Promise.all([
        prisma.entrega.findMany({
          where: { ...where, valorDescarga: { gt: 0 } },
          select: { codigo: true, razaoSocial: true, valorDescarga: true, dataEntrega: true },
          orderBy: { valorDescarga: "desc" },
          take: 5
        }),
        prisma.rota.findMany({
          where: { data: { gte: inicio, lte: fim }, valorDescarga: { gt: 0 } },
          select: { codigo: true, valorDescarga: true, data: true },
          orderBy: { valorDescarga: "desc" },
          take: 5
        })
      ]);
      detalheDescargas = [
        ...descEntregas.map(d => ({ ref: d.codigo, info: d.razaoSocial, valor: d.valorDescarga, data: d.dataEntrega })),
        ...descRotas.map(d => ({ ref: d.codigo, info: "Rota Fracionada", valor: d.valorDescarga, data: d.data }))
      ].sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 5);
    } catch {}

    // Taxa de entrega
    const entregues = porStatus.filter((s: any) => ["ENTREGUE", "FINALIZADO"].includes(s.status)).reduce((s: number, x: any) => s + x._count, 0);
    const taxaEntrega = entregasCount > 0 ? Math.round((entregues / entregasCount) * 100) : 0;

    const receitaFrete = receitaTotal._sum.valorFrete || 0;
    const ticketMedio = receitaTotal._avg.valorFrete || 0;
    const margem = receitaFrete - custoMotorista;
    const margemPercent = receitaFrete > 0 ? Math.round((margem / receitaFrete) * 100) : 0;

    const financeiro = {
      _sum: {
        valorFrete: receitaFrete,
        valorDescarga: valorDescargaTotal,
        custoMotorista,
        adiantamento,
        saldoPendente,
        armazenagem: armazenagemTotal,
        armazenagemFaturada,
      },
      _avg: { valorFrete: ticketMedio },
      margem,
      margemPercent,
      taxaEntrega,
      pesoTotal: receitaTotal._sum.pesoTotal || 0,
      volumeTotal: receitaTotal._sum.volumeTotal || 0,
    };

    return NextResponse.json({ tipo, ano, mes, entregas: entregasCount, porStatus, porCidade, financeiro, notas, detalheDescargas });
  }

  // ─── Relatório Anual ───────────────────────────────────────────────────────
  if (tipo === "anual") {
    const meses = Array.from({ length: 12 }, (_, i) => i + 1);
    const dadosMensais = [];
    
    // Executa os meses sequencialmente para não esgotar o pool de conexões
    for (const m of meses) {
      const inicio = new Date(ano, m - 1, 1);
      const fim = new Date(ano, m, 0, 23, 59, 59);
      const where = dateFilter(inicio, fim);
      const [count, aggEntrega, aggRota] = await Promise.all([
        prisma.entrega.count({ where }),
        prisma.entrega.aggregate({
          where,
          _sum: { valorFrete: true, pesoTotal: true },
        }),
        (prisma.rota as any).aggregate({
          where: { data: { gte: inicio, lte: fim } },
          _sum: { valorMotorista: true },
        }),
      ]);
      dadosMensais.push({
        mes: m,
        entregas: count,
        frete: aggEntrega._sum.valorFrete ?? 0,
        peso: aggEntrega._sum.pesoTotal ?? 0,
        custoMotorista: (aggRota._sum as any)?.valorMotorista ?? 0,
      });
    }

    const anoInicio = new Date(ano, 0, 1);
    const anoFim = new Date(ano, 11, 31, 23, 59, 59);
    const totalAnual = await prisma.entrega.aggregate({
      where: dateFilter(anoInicio, anoFim),
      _sum: { valorFrete: true, pesoTotal: true },
      _count: true,
    });

    return NextResponse.json({ tipo, ano, dadosMensais, totalAnual });
  }

  // ─── Relatório de Motoristas ───────────────────────────────────────────────
  if (tipo === "motoristas") {
    const inicio = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 0, 23, 59, 59);
    const where = dateFilter(inicio, fim);

    const motoristas = await prisma.motorista.findMany({
      where: { ativo: true },
      include: {
        entregas: {
          where,
          select: { status: true, valorFrete: true, pesoTotal: true, rotaId: true, valorMotorista: true, adiantamentoMotorista: true, saldoMotorista: true, valorDescarga: true },
        },
        rotas: {
          where: { data: { gte: inicio, lte: fim } },
          include: {
            entregas: { select: { valorFrete: true, status: true } },
          },
        },
      },
    });

    const ranking = motoristas
      .map((m: any) => {
        const totalEntregas = m.entregas.length;
        const entregues = m.entregas.filter((e: any) => ["ENTREGUE", "FINALIZADO"].includes(e.status)).length;

        const freteEntregasDiretas = m.entregas.filter((e: any) => !e.rotaId).reduce((s: number, e: any) => s + (e.valorFrete || 0), 0);
        const freteRotas = m.rotas.reduce((s: number, r: any) => s + (r.entregas || []).reduce((rs: number, re: any) => rs + (re.valorFrete || 0), 0), 0);
        const frete = freteEntregasDiretas + freteRotas;

        const valorMotorista =
          m.entregas.filter((e: any) => !e.rotaId).reduce((s: number, e: any) => s + (e.valorMotorista || 0), 0) +
          m.rotas.reduce((s: number, r: any) => s + (r.valorMotorista || 0), 0);

        const adiantamento =
          m.entregas.filter((e: any) => !e.rotaId).reduce((s: number, e: any) => s + (e.adiantamentoMotorista || 0), 0) +
          m.rotas.reduce((s: number, r: any) => s + (r.adiantamentoMotorista || 0), 0);

        const saldo =
          m.entregas.filter((e: any) => !e.rotaId).reduce((s: number, e: any) => s + (e.saldoMotorista || 0), 0) +
          m.rotas.reduce((s: number, r: any) => s + (r.saldoMotorista || 0), 0);

        const peso =
          m.entregas.filter((e: any) => !e.rotaId).reduce((s: number, e: any) => s + (e.pesoTotal || 0), 0) +
          m.rotas.reduce((s: number, r: any) => s + (r.pesoTotal || 0), 0);

        const descarga =
          m.entregas.filter((e: any) => !e.rotaId).reduce((s: number, e: any) => s + (e.valorDescarga || 0), 0) +
          m.rotas.reduce((s: number, r: any) => s + (r.valorDescarga || 0), 0);

        return { id: m.id, nome: m.nome, totalEntregas, rotas: m.rotas.length, entregues, frete, valorMotorista, adiantamento, saldo, peso, descarga, ocorrencias: m.entregas.filter((e: any) => e.status === "OCORRENCIA").length };
      })
      .sort((a: any, b: any) => b.totalEntregas - a.totalEntregas);

    return NextResponse.json({ tipo, ano, mes, ranking });
  }

  return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
}
