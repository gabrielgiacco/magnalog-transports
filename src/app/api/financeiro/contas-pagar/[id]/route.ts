import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { upsertLancamentoAutomatico, removeLancamentoAutomatico, categoriaFromTipoConta } from "@/lib/financeiro";

async function requireFinanceiro() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any).role;
  if (!["ADMIN", "FINANCEIRO"].includes(role)) return { error: "Acesso negado", status: 403 };
  return { session };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const existente = await prisma.contaPagar.findUnique({ where: { id: params.id } });
  if (!existente) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (body.tipo !== undefined) data.tipo = body.tipo;
  if (body.descricao !== undefined) data.descricao = String(body.descricao).trim();
  if (body.valor !== undefined) {
    const v = Number(body.valor);
    if (isNaN(v) || v < 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    data.valor = v;
  }
  if (body.dataVencimento !== undefined) data.dataVencimento = new Date(body.dataVencimento);
  if (body.dataPagamento !== undefined) {
    data.dataPagamento = body.dataPagamento ? new Date(body.dataPagamento) : null;
    data.status = body.dataPagamento ? "PAGO" : "PENDENTE";
  }
  if (body.status !== undefined && body.dataPagamento === undefined) data.status = body.status;
  if (body.favorecido !== undefined) data.favorecido = body.favorecido || null;
  if (body.formaPagamento !== undefined) data.formaPagamento = body.formaPagamento || null;
  if (body.observacoes !== undefined) data.observacoes = body.observacoes || null;

  const updated = await prisma.contaPagar.update({ where: { id: params.id }, data });

  // sincroniza com LancamentoFinanceiro
  if (updated.status === "PAGO" && updated.dataPagamento) {
    await upsertLancamentoAutomatico({
      origem: "CONTA_PAGAR",
      tipo: "DESPESA",
      descricao: updated.descricao,
      valor: updated.valor,
      dataPagamento: updated.dataPagamento,
      categoriaNome: categoriaFromTipoConta(updated.tipo),
      formaPagamento: updated.formaPagamento,
      favorecido: updated.favorecido,
      contaPagarId: updated.id,
    });
  } else if (updated.status !== "PAGO") {
    await removeLancamentoAutomatico("CONTA_PAGAR", { contaPagarId: updated.id });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await removeLancamentoAutomatico("CONTA_PAGAR", { contaPagarId: params.id });
  await prisma.contaPagar.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
