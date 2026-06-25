import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { upsertLancamentoAutomatico, removeLancamentoAutomatico } from "@/lib/financeiro";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const faturas = await prisma.faturaArmazenagem.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json(faturas);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const { fornecedorCnpj, entregaIds, dataVencimento, observacoes } = body;

    if (!fornecedorCnpj || !Array.isArray(entregaIds) || entregaIds.length === 0) {
      return NextResponse.json({ error: "Fornecedor e entregas são obrigatórios" }, { status: 400 });
    }

    const tabela = await prisma.tabelaArmazenagem.findUnique({ where: { cnpjCliente: fornecedorCnpj } });
    if (!tabela) return NextResponse.json({ error: "Tabela de armazenagem não encontrada para o fornecedor" }, { status: 400 });

    const entregas = await prisma.entrega.findMany({
      where: { id: { in: entregaIds } },
      include: { notas: { select: { emitenteCnpj: true, numero: true } } },
    });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const itemsData = entregas
      .filter((e: any) => (e.notas || []).some((n: any) => n.emitenteCnpj === fornecedorCnpj))
      .map((e: any) => {
        const entrada = e.dataChegada || e.createdAt;
        const saida = e.dataEntrega || hoje;
        const dataEntrada = new Date(entrada); dataEntrada.setHours(0, 0, 0, 0);
        const dataSaida = new Date(saida); dataSaida.setHours(0, 0, 0, 0);
        const diasDecorridos = Math.max(0, Math.floor((dataSaida.getTime() - dataEntrada.getTime()) / MS_PER_DAY));
        const diasCobraveis = Math.max(0, diasDecorridos - (tabela.diasFree || 0));
        const valorCalculado = diasCobraveis * (tabela.valorPaleteDia || 0) * (e.quantidadePaletes || 0);
        const nfs = (e.notas || [])
          .filter((n: any) => n.emitenteCnpj === fornecedorCnpj)
          .map((n: any) => n.numero)
          .join(", ");
        return {
          entregaId: e.id,
          fornecedorCnpj,
          codigoEntrega: e.codigo,
          destinatarioRazao: e.razaoSocial || null,
          cidade: e.cidade || null,
          nfs,
          paletes: e.quantidadePaletes || 0,
          diasDecorridos,
          diasCobraveis,
          diasFree: tabela.diasFree || 0,
          valorPaleteDia: tabela.valorPaleteDia || 0,
          valorCalculado,
          dataEntrada: entrada ? new Date(entrada) : null,
          dataSaida: e.dataEntrega || null,
        };
      });

    if (itemsData.length === 0) {
      return NextResponse.json({ error: "Nenhuma entrega válida para este fornecedor" }, { status: 400 });
    }

    const jaFaturados = await prisma.itemFaturaArmazenagem.findMany({
      where: { entregaId: { in: itemsData.map((i) => i.entregaId) }, fornecedorCnpj },
      select: { entregaId: true },
    });
    const jaSet = new Set(jaFaturados.map((j) => j.entregaId));
    const itemsFiltrados = itemsData.filter((i) => !jaSet.has(i.entregaId));

    if (itemsFiltrados.length === 0) {
      return NextResponse.json({ error: "Todas as entregas selecionadas já foram faturadas" }, { status: 400 });
    }

    const valorTotal = itemsFiltrados.reduce((s, i) => s + i.valorCalculado, 0);

    const count = await prisma.faturaArmazenagem.count();
    const numero = `ARM-${String(count + 1).padStart(5, "0")}`;

    const fatura = await prisma.faturaArmazenagem.create({
      data: {
        numero,
        fornecedorCnpj,
        fornecedorNome: tabela.nomeCliente,
        valorTotal,
        dataVencimento: dataVencimento ? new Date(dataVencimento) : new Date(Date.now() + 30 * MS_PER_DAY),
        status: "ABERTA",
        observacoes: observacoes || null,
        items: { create: itemsFiltrados },
      },
      include: { items: true },
    });

    return NextResponse.json(fatura, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const data: any = {};
    if (body.status) data.status = body.status;
    if (body.dataVencimento) data.dataVencimento = new Date(body.dataVencimento);
    if (body.observacoes !== undefined) data.observacoes = body.observacoes;

    const fatura = await prisma.faturaArmazenagem.update({
      where: { id: body.id },
      data,
    });

    // Sincroniza LancamentoFinanceiro
    if (fatura.status === "PAGA") {
      const dataPagamento = body.dataPagamento ? new Date(body.dataPagamento) : new Date();
      await upsertLancamentoAutomatico({
        origem: "FATURA_ARMAZENAGEM",
        tipo: "RECEITA",
        descricao: `Armazenagem ${fatura.numero} · ${fatura.fornecedorNome}`,
        valor: fatura.valorTotal,
        dataPagamento,
        categoriaNome: "Armazenagem",
        formaPagamento: body.formaPagamento || null,
        favorecido: fatura.fornecedorNome,
        faturaArmazenagemId: fatura.id,
      });
    } else {
      await removeLancamentoAutomatico("FATURA_ARMAZENAGEM", { faturaArmazenagemId: fatura.id });
    }

    return NextResponse.json(fatura);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const user = (session.user as any);
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });

    await prisma.faturaArmazenagem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
