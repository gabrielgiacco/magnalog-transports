import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

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
  const tipo = searchParams.get("tipo"); // RECEITA | DESPESA
  const status = searchParams.get("status"); // PENDENTE | PAGO | CANCELADO
  const origem = searchParams.get("origem"); // MANUAL | ...
  const categoriaId = searchParams.get("categoriaId");
  const q = searchParams.get("q")?.trim();
  const inicio = searchParams.get("inicio"); // YYYY-MM-DD
  const fim = searchParams.get("fim");       // YYYY-MM-DD
  const dataFiltro = searchParams.get("dataFiltro") || "pagamento"; // pagamento|vencimento
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.get("limit") || "50")));

  const where: any = {};
  if (tipo === "RECEITA" || tipo === "DESPESA") where.tipo = tipo;
  if (status === "PENDENTE" || status === "PAGO" || status === "CANCELADO") where.status = status;
  if (origem) where.origem = origem;
  if (categoriaId) where.categoriaId = categoriaId;
  if (q) {
    where.OR = [
      { descricao: { contains: q, mode: "insensitive" } },
      { favorecido: { contains: q, mode: "insensitive" } },
    ];
  }
  if (inicio || fim) {
    const campo = dataFiltro === "vencimento" ? "dataVencimento" : "dataPagamento";
    where[campo] = {};
    if (inicio) where[campo].gte = new Date(inicio + "T00:00:00");
    if (fim) where[campo].lte = new Date(fim + "T23:59:59");
  }

  const [lancamentos, total, totRec, totDes] = await Promise.all([
    prisma.lancamentoFinanceiro.findMany({
      where,
      orderBy: [{ dataVencimento: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        categoria: { select: { id: true, nome: true, tipo: true } },
        subcategoria: { select: { id: true, nome: true } },
      },
    }),
    prisma.lancamentoFinanceiro.count({ where }),
    prisma.lancamentoFinanceiro.aggregate({ where: { ...where, tipo: "RECEITA" }, _sum: { valor: true } }),
    prisma.lancamentoFinanceiro.aggregate({ where: { ...where, tipo: "DESPESA" }, _sum: { valor: true } }),
  ]);

  return NextResponse.json({
    lancamentos,
    total,
    pages: Math.ceil(total / limit),
    page,
    totais: {
      receitas: totRec._sum.valor || 0,
      despesas: totDes._sum.valor || 0,
      saldo: (totRec._sum.valor || 0) - (totDes._sum.valor || 0),
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body.descricao || !body.tipo || body.valor === undefined || !body.dataVencimento || !body.categoriaId) {
    return NextResponse.json({ error: "Campos obrigatórios: descricao, tipo, valor, dataVencimento, categoriaId" }, { status: 400 });
  }
  if (!["RECEITA", "DESPESA"].includes(body.tipo)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  const valor = Number(body.valor);
  if (isNaN(valor) || valor < 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });

  // valida que a categoria existe e bate com o tipo
  const cat = await prisma.categoriaFinanceira.findUnique({ where: { id: body.categoriaId } });
  if (!cat) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 400 });
  if (cat.tipo !== body.tipo) {
    return NextResponse.json({ error: "Categoria não corresponde ao tipo do lançamento" }, { status: 400 });
  }

  const dataVencimento = new Date(body.dataVencimento);
  const dataPagamento = body.dataPagamento ? new Date(body.dataPagamento) : null;
  const status = dataPagamento ? "PAGO" : "PENDENTE";

  const created = await prisma.lancamentoFinanceiro.create({
    data: {
      descricao: String(body.descricao).trim(),
      tipo: body.tipo,
      valor,
      dataVencimento,
      dataPagamento,
      status,
      origem: "MANUAL",
      categoriaId: body.categoriaId,
      subcategoriaId: body.subcategoriaId || null,
      formaPagamento: body.formaPagamento || null,
      contaBancaria: body.contaBancaria || null,
      favorecido: body.favorecido || null,
      anexoUrl: body.anexoUrl || null,
      observacoes: body.observacoes || null,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
