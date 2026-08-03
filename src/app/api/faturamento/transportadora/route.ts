import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PreviewItem = {
  entregaId: string;
  cteId: string | null;
  cteNumero: string | null;
  cteValorTotal: number;
  codigoEntrega: string;
  destinatarioRazao: string | null;
  cidade: string | null;
  nfs: string;
  quantidadePaletes: number;
  dataEntrega: string | null;
  valorPercentualCTE: number;
  valorTaxaEntrega: number;
  valorPaletizacao: number;
  valorArmazenagem: number;
  valorDiaria: number;
  valorDescarga: number;
  subtotal: number;
};

async function calcular(transportadoraCnpj: string, inicio: Date, fim: Date) {
  const cnpj = transportadoraCnpj.replace(/\D/g, "");
  const acordo = await prisma.acordoTransportadora.findUnique({ where: { transportadoraCnpj: cnpj } });
  if (!acordo) return { erro: "SEM_ACORDO" as const };

  const ctes = await prisma.cTe.findMany({
    where: {
      emitenteCnpj: cnpj,
      dataEmissao: { gte: inicio, lte: fim },
    },
    include: {
      notas: {
        include: {
          entrega: {
            include: {
              diarias: { select: { valor: true } },
            },
          },
        },
      },
    },
    orderBy: { dataEmissao: "asc" },
  });

  const items: PreviewItem[] = [];
  const totais = {
    valorPercentualCTE: 0,
    valorTaxaEntrega: 0,
    valorPaletizacao: 0,
    valorArmazenagem: 0,
    valorDiarias: 0,
    valorDescarga: 0,
    valorTotal: 0,
    totalCTes: ctes.length,
    totalEntregas: 0,
  };

  for (const cte of ctes) {
    const entregasMap = new Map<string, { entrega: any; nfs: string[] }>();
    for (const nf of cte.notas) {
      if (!nf.entrega) continue;
      const cur = entregasMap.get(nf.entrega.id) || { entrega: nf.entrega, nfs: [] };
      cur.nfs.push(nf.numero);
      entregasMap.set(nf.entrega.id, cur);
    }

    const entregasArr = Array.from(entregasMap.values());
    const nEntregas = entregasArr.length;
    if (nEntregas === 0) continue;
    const valorPercentualPorEntrega = (cte.valorReceber || 0) * (acordo.percentualCTE / 100) / nEntregas;

    for (const { entrega, nfs } of entregasArr) {
      const valorDiaria = (entrega.diarias || []).reduce((s: number, d: any) => s + (d.valor || 0), 0);
      const valorPaletizacao = (entrega.quantidadePaletes || 0) * acordo.valorPaleteFixo;
      const valorArmazenagem = entrega.valorArmazenagem || 0;
      const valorDescarga = entrega.valorDescarga || 0;
      // Taxa de entrega vem do valorFrete de cada entrega (varia por caminhão/rota)
      const valorTaxaEntrega = entrega.valorFrete || 0;
      const subtotal =
        valorPercentualPorEntrega + valorTaxaEntrega + valorPaletizacao + valorArmazenagem + valorDiaria + valorDescarga;

      items.push({
        entregaId: entrega.id,
        cteId: cte.id,
        cteNumero: cte.numero,
        cteValorTotal: cte.valorReceber || 0,
        codigoEntrega: entrega.codigo,
        destinatarioRazao: entrega.razaoSocial,
        cidade: entrega.cidade,
        nfs: nfs.join(", "),
        quantidadePaletes: entrega.quantidadePaletes || 0,
        dataEntrega: entrega.dataEntrega ? new Date(entrega.dataEntrega).toISOString() : null,
        valorPercentualCTE: valorPercentualPorEntrega,
        valorTaxaEntrega,
        valorPaletizacao,
        valorArmazenagem,
        valorDiaria,
        valorDescarga,
        subtotal,
      });

      totais.valorPercentualCTE += valorPercentualPorEntrega;
      totais.valorTaxaEntrega += valorTaxaEntrega;
      totais.valorPaletizacao += valorPaletizacao;
      totais.valorArmazenagem += valorArmazenagem;
      totais.valorDiarias += valorDiaria;
      totais.valorDescarga += valorDescarga;
      totais.valorTotal += subtotal;
      totais.totalEntregas++;
    }
  }

  return { erro: null, acordo, items, totais };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const cnpj = searchParams.get("transportadoraCnpj") || "";
    const inicioStr = searchParams.get("inicio");
    const fimStr = searchParams.get("fim");
    if (!cnpj || !inicioStr || !fimStr) {
      return NextResponse.json({ error: "transportadoraCnpj, inicio e fim obrigatórios" }, { status: 400 });
    }
    const inicio = new Date(inicioStr + "T00:00:00.000Z");
    const fim = new Date(fimStr + "T23:59:59.999Z");

    const result = await calcular(cnpj, inicio, fim);
    if (result.erro === "SEM_ACORDO") {
      return NextResponse.json({ error: "Cadastre o acordo dessa transportadora primeiro" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const cnpj = String(body.transportadoraCnpj || "").replace(/\D/g, "");
    if (!cnpj || !body.inicio || !body.fim) {
      return NextResponse.json({ error: "transportadoraCnpj, inicio e fim obrigatórios" }, { status: 400 });
    }
    const inicio = new Date(body.inicio + "T00:00:00.000Z");
    const fim = new Date(body.fim + "T23:59:59.999Z");

    const result = await calcular(cnpj, inicio, fim);
    if (result.erro === "SEM_ACORDO") {
      return NextResponse.json({ error: "Cadastre o acordo dessa transportadora primeiro" }, { status: 404 });
    }
    if (result.items.length === 0) {
      return NextResponse.json({ error: "Nenhuma entrega no período" }, { status: 400 });
    }

    // Numero sequencial FT-YYYYMM-NNNN
    const ym = `${inicio.getUTCFullYear()}${String(inicio.getUTCMonth() + 1).padStart(2, "0")}`;
    const countMes = await prisma.faturaTransportadora.count({
      where: { numero: { startsWith: `FT-${ym}-` } },
    });
    const numero = `FT-${ym}-${String(countMes + 1).padStart(4, "0")}`;

    const fatura = await prisma.faturaTransportadora.create({
      data: {
        numero,
        transportadoraCnpj: cnpj,
        transportadoraNome: result.acordo.transportadoraNome,
        dataInicio: inicio,
        dataFim: fim,
        valorPercentualCTE: result.totais.valorPercentualCTE,
        valorTaxaEntrega: result.totais.valorTaxaEntrega,
        valorPaletizacao: result.totais.valorPaletizacao,
        valorArmazenagem: result.totais.valorArmazenagem,
        valorDiarias: result.totais.valorDiarias,
        valorDescarga: result.totais.valorDescarga,
        valorTotal: result.totais.valorTotal,
        observacoes: body.observacoes || null,
        itens: {
          create: result.items.map((it) => ({
            entregaId: it.entregaId,
            cteId: it.cteId,
            cteNumero: it.cteNumero,
            cteValorTotal: it.cteValorTotal,
            codigoEntrega: it.codigoEntrega,
            destinatarioRazao: it.destinatarioRazao,
            cidade: it.cidade,
            nfs: it.nfs,
            quantidadePaletes: it.quantidadePaletes,
            valorPercentualCTE: it.valorPercentualCTE,
            valorTaxaEntrega: it.valorTaxaEntrega,
            valorPaletizacao: it.valorPaletizacao,
            valorArmazenagem: it.valorArmazenagem,
            valorDiaria: it.valorDiaria,
            valorDescarga: it.valorDescarga,
            subtotal: it.subtotal,
          })),
        },
      },
    });

    return NextResponse.json(fatura, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
