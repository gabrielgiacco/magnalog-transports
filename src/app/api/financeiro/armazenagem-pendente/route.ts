import { NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function GET() {
  try {
    const auth = await requireApi(["ADMIN", "FINANCEIRO"]);
    if (!auth.ok) return auth.response;

    const tabelas = await prisma.tabelaArmazenagem.findMany();
    if (tabelas.length === 0) return NextResponse.json([]);

    const cnpjs = tabelas.map((t: any) => t.cnpjCliente);

    const jaFaturados = await prisma.itemFaturaArmazenagem.findMany({
      where: { fornecedorCnpj: { in: cnpjs } },
      select: { entregaId: true, fornecedorCnpj: true },
    });
    const faturadosSet = new Set(jaFaturados.map((j: any) => `${j.entregaId}|${j.fornecedorCnpj}`));

    const entregas = await prisma.entrega.findMany({
      where: {
        quantidadePaletes: { gt: 0 },
        notas: { some: { emitenteCnpj: { in: cnpjs } } },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        codigo: true,
        cnpj: true,
        razaoSocial: true,
        cidade: true,
        quantidadePaletes: true,
        dataChegada: true,
        dataEntrega: true,
        dataAgendada: true,
        createdAt: true,
        status: true,
        valorArmazenagem: true,
        diasArmazenagem: true,
        notas: { select: { emitenteCnpj: true, emitenteRazao: true, numero: true } },
      },
    });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const grouped: Record<string, any> = {};

    for (const tab of tabelas as any[]) {
      grouped[tab.cnpjCliente] = {
        cnpjCliente: tab.cnpjCliente,
        nomeCliente: tab.nomeCliente,
        diasFree: tab.diasFree,
        valorPaleteDia: tab.valorPaleteDia,
        totalValor: 0,
        totalPaletes: 0,
        entregas: [],
      };
    }

    for (const e of entregas as any[]) {
      const entrada = e.dataChegada || e.createdAt;
      const saida = e.dataEntrega || hoje;
      const dataEntrada = new Date(entrada);
      dataEntrada.setHours(0, 0, 0, 0);
      const dataSaida = new Date(saida);
      dataSaida.setHours(0, 0, 0, 0);
      const diasDecorridos = Math.max(0, Math.floor((dataSaida.getTime() - dataEntrada.getTime()) / MS_PER_DAY));

      const emitentesNaEntrega = Array.from(new Set((e.notas || []).map((n: any) => n.emitenteCnpj).filter(Boolean)));

      for (const emitenteCnpj of emitentesNaEntrega) {
        const tab = grouped[emitenteCnpj as string];
        if (!tab) continue;

        if (faturadosSet.has(`${e.id}|${emitenteCnpj}`)) continue;

        const diasCobraveis = Math.max(0, diasDecorridos - (tab.diasFree || 0));
        const valorCalculado = diasCobraveis * (tab.valorPaleteDia || 0) * (e.quantidadePaletes || 0);
        const nfsDoEmitente = e.notas.filter((n: any) => n.emitenteCnpj === emitenteCnpj).map((n: any) => n.numero);

        tab.entregas.push({
          id: e.id,
          codigo: e.codigo,
          destinatarioRazao: e.razaoSocial,
          cidade: e.cidade,
          status: e.status,
          quantidadePaletes: e.quantidadePaletes,
          dataEntrada: entrada,
          dataSaida: e.dataEntrega || null,
          diasDecorridos,
          diasCobraveis,
          valorCalculado,
          nfs: nfsDoEmitente,
        });
        tab.totalPaletes += e.quantidadePaletes;
        tab.totalValor += valorCalculado;
      }
    }

    const result = Object.values(grouped).filter((g: any) => g.entregas.length > 0);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
