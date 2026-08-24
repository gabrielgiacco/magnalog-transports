import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { casar, descreverMotivos, type LancamentoCandidato } from "@/lib/extrato/conciliacao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lista as transações pendentes com as sugestões de casamento já calculadas.
 *
 * O cálculo é feito na leitura, não gravado: os lançamentos mudam de status o
 * tempo todo, e uma sugestão salva envelheceria apontando para algo já pago.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contaId = searchParams.get("contaId") || undefined;
  const status = searchParams.get("status") || "PENDENTE";

  const transacoes = await prisma.transacaoBancaria.findMany({
    where: { status, ...(contaId ? { contaId } : {}) },
    orderBy: { data: "desc" },
    take: 300,
    include: { conta: { select: { id: true, nome: true } } },
  });

  if (transacoes.length === 0) return NextResponse.json({ transacoes: [] });

  // Candidatos: só o que ainda está em aberto. Lançamento já pago não deve
  // aparecer como sugestão, senão o mesmo pagamento seria conciliado duas vezes.
  const [pendentes, motoristas] = await Promise.all([
    prisma.lancamentoFinanceiro.findMany({
      where: { status: "PENDENTE" },
      select: {
        id: true, descricao: true, valor: true, tipo: true,
        dataVencimento: true, dataPagamento: true, favorecido: true,
      },
    }),
    prisma.motorista.findMany({ select: { nome: true, cpf: true } }),
  ]);

  const cpfPorNome = new Map(
    motoristas.filter((m) => m.cpf).map((m) => [m.nome.toLowerCase().trim(), m.cpf!])
  );

  const candidatos: LancamentoCandidato[] = pendentes.map((l) => ({
    ...l,
    tipo: l.tipo as "RECEITA" | "DESPESA",
    documentoFavorecido: l.favorecido ? cpfPorNome.get(l.favorecido.toLowerCase().trim()) || null : null,
  }));

  const resultado = transacoes.map((t) => {
    const { sugestoes, confiavel } = casar(
      { data: t.data, valor: t.valor, descricao: t.descricao, documento: t.documento },
      candidatos
    );
    return {
      id: t.id,
      data: t.data,
      valor: t.valor,
      descricao: t.descricao,
      documento: t.documento,
      origem: t.origem,
      conta: t.conta,
      confiavel,
      sugestoes: sugestoes.map((s) => ({
        lancamentoId: s.lancamento.id,
        descricao: s.lancamento.descricao,
        valor: s.lancamento.valor,
        favorecido: s.lancamento.favorecido,
        dataVencimento: s.lancamento.dataVencimento,
        pontos: s.pontos,
        motivo: descreverMotivos(s),
      })),
    };
  });

  return NextResponse.json({
    transacoes: resultado,
    resumo: {
      total: resultado.length,
      comSugestao: resultado.filter((r) => r.sugestoes.length > 0).length,
      confiaveis: resultado.filter((r) => r.confiavel).length,
      semSugestao: resultado.filter((r) => r.sugestoes.length === 0).length,
    },
  });
}
