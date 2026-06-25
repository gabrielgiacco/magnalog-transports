import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireFinanceiro() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any).role;
  if (!["ADMIN", "FINANCEIRO"].includes(role)) return { error: "Acesso negado", status: 403 };
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const ate = Math.min(180, Math.max(7, parseInt(searchParams.get("ate") || "90")));

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(hoje);
  fim.setDate(fim.getDate() + ate);
  fim.setHours(23, 59, 59, 999);

  // Saldo inicial: soma de tudo PAGO até hoje
  const [recPagas, despPagas] = await Promise.all([
    prisma.lancamentoFinanceiro.aggregate({
      where: { status: "PAGO", tipo: "RECEITA", dataPagamento: { lte: hoje } },
      _sum: { valor: true },
    }),
    prisma.lancamentoFinanceiro.aggregate({
      where: { status: "PAGO", tipo: "DESPESA", dataPagamento: { lte: hoje } },
      _sum: { valor: true },
    }),
  ]);
  const saldoInicial = (recPagas._sum.valor || 0) - (despPagas._sum.valor || 0);

  // Entradas previstas: Faturas + FaturaArmazenagem ABERTAS no período
  const [faturas, faturasArm, lancsRecPendentes] = await Promise.all([
    prisma.fatura.findMany({
      where: { status: "ABERTA", dataVencimento: { gte: hoje, lte: fim } },
      select: { id: true, numero: true, clienteNome: true, valorTotal: true, dataVencimento: true },
    }),
    prisma.faturaArmazenagem.findMany({
      where: { status: "ABERTA", dataVencimento: { gte: hoje, lte: fim } },
      select: { id: true, numero: true, fornecedorNome: true, valorTotal: true, dataVencimento: true },
    }),
    prisma.lancamentoFinanceiro.findMany({
      where: { status: "PENDENTE", tipo: "RECEITA", dataVencimento: { gte: hoje, lte: fim } },
      select: { id: true, descricao: true, valor: true, dataVencimento: true, favorecido: true },
    }),
  ]);

  // Saídas previstas: ContaPagar + LancamentoFinanceiro DESPESA PENDENTE no período
  const [contas, lancsDespPendentes, entregasAcerto] = await Promise.all([
    prisma.contaPagar.findMany({
      where: { status: "PENDENTE", dataVencimento: { gte: hoje, lte: fim } },
      select: { id: true, descricao: true, valor: true, dataVencimento: true, favorecido: true, tipo: true },
    }),
    prisma.lancamentoFinanceiro.findMany({
      where: { status: "PENDENTE", tipo: "DESPESA", dataVencimento: { gte: hoje, lte: fim } },
      select: { id: true, descricao: true, valor: true, dataVencimento: true, favorecido: true },
    }),
    // Acertos com dataPagamentoSaldo futura (planejado para pagar)
    prisma.entrega.findMany({
      where: {
        dataPagamentoSaldo: { gte: hoje, lte: fim },
        saldoMotorista: { gt: 0 },
      },
      select: { id: true, codigo: true, saldoMotorista: true, dataPagamentoSaldo: true, motorista: { select: { nome: true } } },
    }),
  ]);

  // Constrói linha do tempo dia a dia
  const dias: { data: string; entradas: number; saidas: number; saldo: number; itens: any[] }[] = [];
  let saldoAcumulado = saldoInicial;

  for (let i = 0; i <= ate; i++) {
    const dia = new Date(hoje);
    dia.setDate(dia.getDate() + i);
    const diaStr = dia.toISOString().slice(0, 10);

    const entradasDia: any[] = [];
    const saidasDia: any[] = [];

    for (const f of faturas) {
      if (f.dataVencimento.toISOString().slice(0, 10) === diaStr) {
        entradasDia.push({ id: f.id, tipo: "fatura", descricao: `Fatura ${f.numero}`, valor: f.valorTotal, parte: f.clienteNome });
      }
    }
    for (const f of faturasArm) {
      if (f.dataVencimento.toISOString().slice(0, 10) === diaStr) {
        entradasDia.push({ id: f.id, tipo: "fatura_arm", descricao: `Armazenagem ${f.numero}`, valor: f.valorTotal, parte: f.fornecedorNome });
      }
    }
    for (const l of lancsRecPendentes) {
      if (l.dataVencimento.toISOString().slice(0, 10) === diaStr) {
        entradasDia.push({ id: l.id, tipo: "lancamento", descricao: l.descricao, valor: l.valor, parte: l.favorecido });
      }
    }
    for (const c of contas) {
      if (c.dataVencimento.toISOString().slice(0, 10) === diaStr) {
        saidasDia.push({ id: c.id, tipo: "conta_pagar", descricao: c.descricao, valor: c.valor, parte: c.favorecido });
      }
    }
    for (const l of lancsDespPendentes) {
      if (l.dataVencimento.toISOString().slice(0, 10) === diaStr) {
        saidasDia.push({ id: l.id, tipo: "lancamento", descricao: l.descricao, valor: l.valor, parte: l.favorecido });
      }
    }
    for (const e of entregasAcerto) {
      if (e.dataPagamentoSaldo && e.dataPagamentoSaldo.toISOString().slice(0, 10) === diaStr) {
        saidasDia.push({ id: e.id, tipo: "acerto", descricao: `Acerto ${e.codigo}`, valor: e.saldoMotorista, parte: e.motorista?.nome });
      }
    }

    const entradas = entradasDia.reduce((s, x) => s + x.valor, 0);
    const saidas = saidasDia.reduce((s, x) => s + x.valor, 0);
    saldoAcumulado += entradas - saidas;

    dias.push({
      data: diaStr,
      entradas,
      saidas,
      saldo: saldoAcumulado,
      itens: [...entradasDia.map((x) => ({ ...x, fluxo: "entrada" })), ...saidasDia.map((x) => ({ ...x, fluxo: "saida" }))],
    });
  }

  // KPIs
  const piorSaldo = dias.reduce((min, d) => (d.saldo < min.valor ? { valor: d.saldo, data: d.data } : min), { valor: Infinity, data: "" });
  const totalEntradas = dias.reduce((s, d) => s + d.entradas, 0);
  const totalSaidas = dias.reduce((s, d) => s + d.saidas, 0);
  const diasNegativos = dias.filter((d) => d.saldo < 0).length;

  return NextResponse.json({
    saldoInicial,
    saldoFinal: saldoAcumulado,
    totalEntradas,
    totalSaidas,
    piorSaldo: { valor: piorSaldo.valor === Infinity ? saldoInicial : piorSaldo.valor, data: piorSaldo.data },
    diasNegativos,
    dias,
  });
}
