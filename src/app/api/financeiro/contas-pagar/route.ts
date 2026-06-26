import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { upsertLancamentoAutomatico, categoriaFromTipoConta } from "@/lib/financeiro";
import { logFromRequest } from "@/lib/audit";

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
  const status = searchParams.get("status");
  const tipo = searchParams.get("tipo");
  const q = searchParams.get("q")?.trim();
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");

  const where: any = {};
  if (status === "PENDENTE" || status === "PAGO" || status === "CANCELADO") where.status = status;
  if (tipo) where.tipo = tipo;
  if (q) {
    where.OR = [
      { descricao: { contains: q, mode: "insensitive" } },
      { favorecido: { contains: q, mode: "insensitive" } },
    ];
  }
  if (inicio || fim) {
    where.dataVencimento = {};
    if (inicio) where.dataVencimento.gte = new Date(inicio + "T00:00:00");
    if (fim) where.dataVencimento.lte = new Date(fim + "T23:59:59");
  }

  const contas = await prisma.contaPagar.findMany({
    where,
    orderBy: [{ status: "asc" }, { dataVencimento: "asc" }],
    include: {
      entrega: { select: { id: true, codigo: true } },
      rota: { select: { id: true, codigo: true } },
    },
  });

  const totalPendente = contas.filter((c) => c.status === "PENDENTE").reduce((s, c) => s + c.valor, 0);
  const totalPago = contas.filter((c) => c.status === "PAGO").reduce((s, c) => s + c.valor, 0);

  return NextResponse.json({ contas, totalPendente, totalPago });
}

export async function POST(req: NextRequest) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body.tipo || !body.descricao || body.valor === undefined || !body.dataVencimento) {
    return NextResponse.json({ error: "Campos obrigatórios: tipo, descricao, valor, dataVencimento" }, { status: 400 });
  }
  const valor = Number(body.valor);
  if (isNaN(valor) || valor < 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });

  const dataPagamento = body.dataPagamento ? new Date(body.dataPagamento) : null;
  const status = dataPagamento ? "PAGO" : "PENDENTE";

  const created = await prisma.contaPagar.create({
    data: {
      tipo: body.tipo,
      descricao: String(body.descricao).trim(),
      valor,
      dataVencimento: new Date(body.dataVencimento),
      dataPagamento,
      status,
      favorecido: body.favorecido || null,
      formaPagamento: body.formaPagamento || null,
      observacoes: body.observacoes || null,
      rotaId: body.rotaId || null,
      entregaId: body.entregaId || null,
    },
  });

  const user = auth.session!.user as any;
  await logFromRequest(req, status === "PAGO" ? "CONTA_PAGAR_PAGA" : "CONTA_PAGAR_CRIADA", {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    recursoTipo: "conta_pagar",
    recursoId: created.id,
    recursoDesc: `${created.tipo} · ${created.descricao}`,
    detalhes: { valor: created.valor, status: created.status, favorecido: created.favorecido },
  });

  // se já criou paga, dispara lançamento automático
  if (status === "PAGO" && dataPagamento) {
    await upsertLancamentoAutomatico({
      origem: "CONTA_PAGAR",
      tipo: "DESPESA",
      descricao: created.descricao,
      valor: created.valor,
      dataPagamento,
      categoriaNome: categoriaFromTipoConta(created.tipo),
      formaPagamento: created.formaPagamento,
      favorecido: created.favorecido,
      contaPagarId: created.id,
    });
  }

  return NextResponse.json(created, { status: 201 });
}
