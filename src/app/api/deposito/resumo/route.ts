import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { diasParados, LIMITE_ATENCAO, LIMITE_CRITICO } from "@/lib/deposito";
import { contarCandidatos } from "@/lib/deposito-candidatos";

export const dynamic = "force-dynamic";

// KPIs do Depósito para o topo da tela: o que está parado, há quanto tempo,
// e quanto ainda falta conferir. candidatosPendentes reusa os mesmos where
// de src/lib/deposito-candidatos.ts — mudar um critério lá já reflete aqui.
export async function GET(_req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const agora = Date.now();
  const limite15 = new Date(agora - LIMITE_ATENCAO * 86400000);
  const limite30 = new Date(agora - LIMITE_CRITICO * 86400000);
  const hoje = new Date();
  const inicioMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const inicioProximoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1));

  const [emEstoqueCount, emEstoqueRows, porEmbarcadorBruto, acima15dias, acima30dias, maisAntigo, baixadosMes, candidatosPendentes] =
    await Promise.all([
      prisma.depositoItem.count({ where: { status: "EM_ESTOQUE" } }),
      // Traz as linhas em vez de usar aggregate/groupBy: volumes/peso/valor
      // têm de somar pelo SALDO, não pelo lote (ver reduce abaixo), e o
      // Prisma não expressa sum(volumes - volumesBaixados) num aggregate. A
      // população em estoque é dezenas a poucas centenas de linhas — barato.
      prisma.depositoItem.findMany({
        where: { status: "EM_ESTOQUE" },
        select: { tipoEntrada: true, volumes: true, volumesBaixados: true, pesoKg: true, valorMercadoria: true },
      }),
      prisma.depositoItem.groupBy({
        by: ["embarcadorCnpj", "embarcadorRazao"],
        where: { status: "EM_ESTOQUE" },
        _count: true,
        orderBy: { _count: { embarcadorCnpj: "desc" } },
        take: 10,
      }),
      prisma.depositoItem.count({ where: { status: "EM_ESTOQUE", dataEntrada: { lte: limite15 } } }),
      prisma.depositoItem.count({ where: { status: "EM_ESTOQUE", dataEntrada: { lte: limite30 } } }),
      prisma.depositoItem.findFirst({
        where: { status: "EM_ESTOQUE" },
        orderBy: { dataEntrada: "asc" },
        select: { dataEntrada: true },
      }),
      prisma.depositoItem.count({ where: { dataSaida: { gte: inicioMes, lt: inicioProximoMes } } }),
      contarCandidatos(prisma),
    ]);

  // Somas pelo SALDO, nao pelo lote: um item com 3 de 10 baixados ainda
  // EM_ESTOQUE tem 7 volumes no predio. Peso e valor entram rateados pelo
  // mesmo saldo, senao o "valor parado" conta mercadoria que ja saiu.
  const totais = emEstoqueRows.reduce(
    (acc, i) => {
      const saldo = Math.max(0, i.volumes - i.volumesBaixados);
      const fracao = i.volumes > 0 ? saldo / i.volumes : 1;
      acc.volumes += saldo;
      acc.peso += i.pesoKg * fracao;
      acc.valor += i.valorMercadoria * fracao;
      return acc;
    },
    { volumes: 0, peso: 0, valor: 0 },
  );

  // porTipoEntrada agrupado em memória a partir da mesma busca — um groupBy
  // do Prisma somaria o lote inteiro, não o saldo.
  const porTipoEntradaMap = new Map<string, { count: number; volumes: number }>();
  for (const i of emEstoqueRows) {
    const saldo = Math.max(0, i.volumes - i.volumesBaixados);
    const atual = porTipoEntradaMap.get(i.tipoEntrada) ?? { count: 0, volumes: 0 };
    atual.count += 1;
    atual.volumes += saldo;
    porTipoEntradaMap.set(i.tipoEntrada, atual);
  }

  return NextResponse.json({
    emEstoque: emEstoqueCount,
    volumesEmEstoque: totais.volumes,
    pesoEmEstoque: Math.round(totais.peso * 100) / 100,
    valorEmEstoque: Math.round(totais.valor * 100) / 100,
    porTipoEntrada: Array.from(porTipoEntradaMap, ([tipoEntrada, v]) => ({
      tipoEntrada,
      count: v.count,
      volumes: v.volumes,
    })),
    porEmbarcador: porEmbarcadorBruto.map((e) => ({
      cnpj: e.embarcadorCnpj,
      razao: e.embarcadorRazao,
      count: e._count,
    })),
    acima15dias,
    acima30dias,
    maisAntigoDias: maisAntigo ? diasParados(maisAntigo.dataEntrada) : 0,
    baixadosMes,
    candidatosPendentes: candidatosPendentes.NOTA_DEVOLUCAO + candidatosPendentes.AVARIA + candidatosPendentes.ENTREGA,
  });
}
