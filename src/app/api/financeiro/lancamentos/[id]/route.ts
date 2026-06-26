import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";

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

  const existente = await prisma.lancamentoFinanceiro.findUnique({ where: { id: params.id } });
  if (!existente) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });

  // Bloqueia edição completa de lançamentos automáticos — só permite quitar/cancelar
  const isAuto = existente.origem !== "MANUAL";
  const body = await req.json();
  const data: any = {};

  if (isAuto) {
    // Só permite alterar status, dataPagamento, formaPagamento e observacoes em auto
    if (body.status) data.status = body.status;
    if (body.dataPagamento !== undefined) data.dataPagamento = body.dataPagamento ? new Date(body.dataPagamento) : null;
    if (body.formaPagamento !== undefined) data.formaPagamento = body.formaPagamento || null;
    if (body.observacoes !== undefined) data.observacoes = body.observacoes || null;
  } else {
    if (body.descricao !== undefined) data.descricao = String(body.descricao).trim();
    if (body.tipo !== undefined) {
      if (!["RECEITA", "DESPESA"].includes(body.tipo)) {
        return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
      }
      data.tipo = body.tipo;
    }
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
    if (body.status !== undefined && body.dataPagamento === undefined) {
      data.status = body.status;
    }
    if (body.categoriaId !== undefined) data.categoriaId = body.categoriaId;
    if (body.subcategoriaId !== undefined) data.subcategoriaId = body.subcategoriaId || null;
    if (body.formaPagamento !== undefined) data.formaPagamento = body.formaPagamento || null;
    if (body.contaBancaria !== undefined) data.contaBancaria = body.contaBancaria || null;
    if (body.favorecido !== undefined) data.favorecido = body.favorecido || null;
    if (body.anexoUrl !== undefined) data.anexoUrl = body.anexoUrl || null;
    if (body.observacoes !== undefined) data.observacoes = body.observacoes || null;
  }

  const updated = await prisma.lancamentoFinanceiro.update({
    where: { id: params.id },
    data,
  });

  const user = auth.session!.user as any;
  await logFromRequest(req, "LANCAMENTO_EDITADO", {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    recursoTipo: "lancamento",
    recursoId: updated.id,
    recursoDesc: `${updated.tipo} · ${updated.descricao}`,
    detalhes: { camposAlterados: Object.keys(data), origem: updated.origem },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const existente = await prisma.lancamentoFinanceiro.findUnique({ where: { id: params.id } });
  if (!existente) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  if (existente.origem !== "MANUAL") {
    return NextResponse.json({ error: "Lançamentos automáticos não podem ser apagados. Cancele a origem (fatura, conta a pagar, etc.)." }, { status: 400 });
  }

  await prisma.lancamentoFinanceiro.delete({ where: { id: params.id } });

  const user = auth.session!.user as any;
  await logFromRequest(req, "LANCAMENTO_APAGADO", {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    recursoTipo: "lancamento",
    recursoId: params.id,
    recursoDesc: `${existente.tipo} · ${existente.descricao}`,
    detalhes: { valor: existente.valor },
  });

  return NextResponse.json({ ok: true });
}
