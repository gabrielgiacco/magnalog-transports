import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Get current month dates
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Fetch all lancamentos for the current month
  const lancamentos = await prisma.lancamentoFinanceiro.findMany({
    where: {
      dataVencimento: {
        gte: startOfMonth,
        lte: endOfMonth
      }
    },
    include: {
      categoria: true
    }
  });

  let totalReceitas = 0;
  let totalDespesas = 0;
  let receitasPagas = 0;
  let despesasPagas = 0;

  const despesasPorCategoria: Record<string, number> = {};

  for (const l of lancamentos) {
    if (l.tipo === "RECEITA") {
      totalReceitas += l.valor;
      if (l.status === "PAGO") receitasPagas += l.valor;
    } else if (l.tipo === "DESPESA") {
      totalDespesas += l.valor;
      if (l.status === "PAGO") despesasPagas += l.valor;
      
      const catName = l.categoria?.nome || "Sem Categoria";
      despesasPorCategoria[catName] = (despesasPorCategoria[catName] || 0) + l.valor;
    }
  }

  const saldoPrevisto = totalReceitas - totalDespesas;
  const saldoRealizado = receitasPagas - despesasPagas;

  return NextResponse.json({
    totalReceitas,
    totalDespesas,
    receitasPagas,
    despesasPagas,
    saldoPrevisto,
    saldoRealizado,
    despesasPorCategoria: Object.entries(despesasPorCategoria).map(([name, value]) => ({ name, value }))
  });
}
