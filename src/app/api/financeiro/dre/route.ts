import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { inicioMes, fimMes, parseMesParam } from "@/lib/financeiro";

export const dynamic = "force-dynamic";

async function requireFinanceiro() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any).role;
  if (!["ADMIN", "FINANCEIRO"].includes(role)) return { error: "Acesso negado", status: 403 };
  return { session };
}

interface AgrupCategoria {
  categoriaId: string | null;
  nome: string;
  total: number;
  subcategorias: { id: string | null; nome: string; total: number }[];
}

async function agruparPeriodo(inicio: Date, fim: Date) {
  const lancamentos = await prisma.lancamentoFinanceiro.findMany({
    where: {
      status: "PAGO",
      dataPagamento: { gte: inicio, lte: fim },
    },
    select: {
      tipo: true,
      valor: true,
      categoria: { select: { id: true, nome: true, ordem: true } },
      subcategoria: { select: { id: true, nome: true } },
    },
  });

  const grupos: Record<"RECEITA" | "DESPESA", Map<string, AgrupCategoria>> = {
    RECEITA: new Map(),
    DESPESA: new Map(),
  };

  for (const l of lancamentos) {
    const tipo = l.tipo as "RECEITA" | "DESPESA";
    const catKey = l.categoria?.id || "_sem_categoria";
    const catNome = l.categoria?.nome || "Sem categoria";
    if (!grupos[tipo].has(catKey)) {
      grupos[tipo].set(catKey, { categoriaId: l.categoria?.id || null, nome: catNome, total: 0, subcategorias: [] });
    }
    const g = grupos[tipo].get(catKey)!;
    g.total += l.valor;
    if (l.subcategoria) {
      let sub = g.subcategorias.find((s) => s.id === l.subcategoria!.id);
      if (!sub) {
        sub = { id: l.subcategoria.id, nome: l.subcategoria.nome, total: 0 };
        g.subcategorias.push(sub);
      }
      sub.total += l.valor;
    }
  }

  return {
    receitas: Array.from(grupos.RECEITA.values()).sort((a, b) => b.total - a.total),
    despesas: Array.from(grupos.DESPESA.values()).sort((a, b) => b.total - a.total),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const { ano, mes } = parseMesParam(searchParams.get("mes"));

  const inicio = inicioMes(ano, mes);
  const fim = fimMes(ano, mes);

  // mês anterior
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const inicioAnt = inicioMes(anoAnt, mesAnt);
  const fimAnt = fimMes(anoAnt, mesAnt);

  const [atual, anterior] = await Promise.all([
    agruparPeriodo(inicio, fim),
    agruparPeriodo(inicioAnt, fimAnt),
  ]);

  const somaR = (arr: AgrupCategoria[]) => arr.reduce((s, c) => s + c.total, 0);
  const totalReceitasAtual = somaR(atual.receitas);
  const totalDespesasAtual = somaR(atual.despesas);
  const totalReceitasAnt = somaR(anterior.receitas);
  const totalDespesasAnt = somaR(anterior.despesas);

  // Histórico 12 meses
  const historico: { mes: string; receitas: number; despesas: number; resultado: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(ano, mes - 1 - i, 1);
    const mAno = d.getFullYear();
    const mMes = d.getMonth() + 1;
    const ini = inicioMes(mAno, mMes);
    const fi = fimMes(mAno, mMes);
    const [recAgg, despAgg] = await Promise.all([
      prisma.lancamentoFinanceiro.aggregate({ where: { status: "PAGO", tipo: "RECEITA", dataPagamento: { gte: ini, lte: fi } }, _sum: { valor: true } }),
      prisma.lancamentoFinanceiro.aggregate({ where: { status: "PAGO", tipo: "DESPESA", dataPagamento: { gte: ini, lte: fi } }, _sum: { valor: true } }),
    ]);
    const rec = recAgg._sum.valor || 0;
    const desp = despAgg._sum.valor || 0;
    historico.push({
      mes: `${String(mMes).padStart(2, "0")}/${String(mAno).slice(2)}`,
      receitas: rec,
      despesas: desp,
      resultado: rec - desp,
    });
  }

  return NextResponse.json({
    mes,
    ano,
    periodo: { inicio, fim },
    atual: {
      receitas: atual.receitas,
      despesas: atual.despesas,
      totalReceitas: totalReceitasAtual,
      totalDespesas: totalDespesasAtual,
      resultado: totalReceitasAtual - totalDespesasAtual,
    },
    anterior: {
      totalReceitas: totalReceitasAnt,
      totalDespesas: totalDespesasAnt,
      resultado: totalReceitasAnt - totalDespesasAnt,
    },
    historico,
  });
}
