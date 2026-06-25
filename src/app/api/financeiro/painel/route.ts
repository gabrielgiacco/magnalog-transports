import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { diasParaVencer } from "@/lib/financeiro";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "FINANCEIRO"].includes(user.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);
  const em30d = new Date(hoje); em30d.setDate(em30d.getDate() + 30);

  // Saldo do caixa = soma de LancamentoFinanceiro PAGO (receitas) - (despesas)
  const [receitasPagas, despesasPagas] = await Promise.all([
    prisma.lancamentoFinanceiro.aggregate({
      where: { status: "PAGO", tipo: "RECEITA" },
      _sum: { valor: true },
    }),
    prisma.lancamentoFinanceiro.aggregate({
      where: { status: "PAGO", tipo: "DESPESA" },
      _sum: { valor: true },
    }),
  ]);
  const saldoCaixa = (receitasPagas._sum.valor || 0) - (despesasPagas._sum.valor || 0);

  // Receitas e despesas do mês corrente
  const [receitasMesAgg, despesasMesAgg] = await Promise.all([
    prisma.lancamentoFinanceiro.aggregate({
      where: { status: "PAGO", tipo: "RECEITA", dataPagamento: { gte: inicioMes, lte: fimMes } },
      _sum: { valor: true },
    }),
    prisma.lancamentoFinanceiro.aggregate({
      where: { status: "PAGO", tipo: "DESPESA", dataPagamento: { gte: inicioMes, lte: fimMes } },
      _sum: { valor: true },
    }),
  ]);
  const receitasMes = receitasMesAgg._sum.valor || 0;
  const despesasMes = despesasMesAgg._sum.valor || 0;
  const resultadoMes = receitasMes - despesasMes;

  // A receber: Faturas ABERTAS + FaturaArmazenagem ABERTAS com vencimento em 30d
  const [faturasAbertas30d, faturasArmAbertas30d, faturasVencidas, faturasArmVencidas] = await Promise.all([
    prisma.fatura.aggregate({
      where: { status: "ABERTA", dataVencimento: { lte: em30d } },
      _sum: { valorTotal: true },
    }),
    prisma.faturaArmazenagem.aggregate({
      where: { status: "ABERTA", dataVencimento: { lte: em30d } },
      _sum: { valorTotal: true },
    }),
    prisma.fatura.aggregate({
      where: { status: "ABERTA", dataVencimento: { lt: hoje } },
      _sum: { valorTotal: true },
    }),
    prisma.faturaArmazenagem.aggregate({
      where: { status: "ABERTA", dataVencimento: { lt: hoje } },
      _sum: { valorTotal: true },
    }),
  ]);
  const aReceber30d = (faturasAbertas30d._sum.valorTotal || 0) + (faturasArmAbertas30d._sum.valorTotal || 0);
  const vencidoReceber = (faturasVencidas._sum.valorTotal || 0) + (faturasArmVencidas._sum.valorTotal || 0);

  // A pagar: ContaPagar PENDENTE + LancamentoFinanceiro PENDENTE DESPESA com vencimento em 30d
  const [contasPagar30d, lancsPendentes30d, contasVencidas, lancsVencidos] = await Promise.all([
    prisma.contaPagar.aggregate({
      where: { status: "PENDENTE", dataVencimento: { lte: em30d } },
      _sum: { valor: true },
    }),
    prisma.lancamentoFinanceiro.aggregate({
      where: { status: "PENDENTE", tipo: "DESPESA", dataVencimento: { lte: em30d } },
      _sum: { valor: true },
    }),
    prisma.contaPagar.aggregate({
      where: { status: "PENDENTE", dataVencimento: { lt: hoje } },
      _sum: { valor: true },
    }),
    prisma.lancamentoFinanceiro.aggregate({
      where: { status: "PENDENTE", tipo: "DESPESA", dataVencimento: { lt: hoje } },
      _sum: { valor: true },
    }),
  ]);
  const aPagar30d = (contasPagar30d._sum.valor || 0) + (lancsPendentes30d._sum.valor || 0);
  const vencidoPagar = (contasVencidas._sum.valor || 0) + (lancsVencidos._sum.valor || 0);

  // Top 5 recebimentos pendentes (faturas)
  const topFaturas = await prisma.fatura.findMany({
    where: { status: "ABERTA" },
    orderBy: { valorTotal: "desc" },
    take: 5,
    select: { id: true, numero: true, valorTotal: true, dataVencimento: true, clienteNome: true },
  });

  const topRecebimentos = topFaturas.map((f) => ({
    id: f.id,
    descricao: `Fatura ${f.numero}`,
    valor: f.valorTotal,
    diasParaVencer: diasParaVencer(f.dataVencimento, hoje),
    cliente: f.clienteNome,
  }));

  // Top 5 pagamentos pendentes (ContaPagar + LancamentoFinanceiro DESPESA)
  const [topContas, topLancs] = await Promise.all([
    prisma.contaPagar.findMany({
      where: { status: "PENDENTE" },
      orderBy: { valor: "desc" },
      take: 5,
      select: { id: true, descricao: true, valor: true, dataVencimento: true, favorecido: true },
    }),
    prisma.lancamentoFinanceiro.findMany({
      where: { status: "PENDENTE", tipo: "DESPESA" },
      orderBy: { valor: "desc" },
      take: 5,
      select: { id: true, descricao: true, valor: true, dataVencimento: true, favorecido: true },
    }),
  ]);

  const topPagamentos = [...topContas, ...topLancs]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      descricao: p.descricao,
      valor: p.valor,
      diasParaVencer: diasParaVencer(p.dataVencimento, hoje),
      favorecido: p.favorecido || undefined,
    }));

  // Alertas
  const alertas: { tipo: "warning" | "danger" | "info"; mensagem: string }[] = [];
  if (saldoCaixa < 0) {
    alertas.push({ tipo: "danger", mensagem: "Saldo do caixa está negativo. Verifique receitas e despesas." });
  }
  if (vencidoReceber > 0) {
    alertas.push({ tipo: "warning", mensagem: `Você tem ${formatCurrencyBR(vencidoReceber)} a receber vencido. Considere cobrar os clientes.` });
  }
  if (vencidoPagar > 0) {
    alertas.push({ tipo: "danger", mensagem: `Você tem ${formatCurrencyBR(vencidoPagar)} em contas vencidas para pagar.` });
  }
  if (alertas.length === 0) {
    alertas.push({ tipo: "info", mensagem: "Nenhum alerta financeiro no momento. Tudo em dia!" });
  }

  return NextResponse.json({
    saldoCaixa,
    receitasMes,
    despesasMes,
    resultadoMes,
    aReceber30d,
    aPagar30d,
    vencidoReceber,
    vencidoPagar,
    topRecebimentos,
    topPagamentos,
    alertas,
  });
}

function formatCurrencyBR(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
