import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { ensureCategoriasFinanceiras } from "@/lib/financeiro";

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

  // seed lazy de categorias padrão se ainda não houver nenhuma
  await ensureCategoriasFinanceiras();

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo"); // RECEITA | DESPESA
  const ativo = searchParams.get("ativo"); // true | false (default = true)

  const where: any = {};
  if (tipo === "RECEITA" || tipo === "DESPESA") where.tipo = tipo;
  if (ativo === "false") where.ativo = false;
  else where.ativo = true;

  const categorias = await prisma.categoriaFinanceira.findMany({
    where,
    orderBy: [{ tipo: "asc" }, { ordem: "asc" }, { nome: "asc" }],
    include: {
      subcategorias: { where: { ativo: true }, orderBy: { nome: "asc" } },
      _count: { select: { lancamentos: true } },
    },
  });

  return NextResponse.json(categorias);
}

export async function POST(req: NextRequest) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body.nome || !body.tipo) {
    return NextResponse.json({ error: "Nome e tipo são obrigatórios" }, { status: 400 });
  }
  if (!["RECEITA", "DESPESA"].includes(body.tipo)) {
    return NextResponse.json({ error: "Tipo deve ser RECEITA ou DESPESA" }, { status: 400 });
  }

  try {
    const cat = await prisma.categoriaFinanceira.create({
      data: {
        nome: body.nome.trim(),
        tipo: body.tipo,
        ordem: body.ordem ?? 500,
        ativo: true,
        sistema: false,
      },
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Já existe uma categoria com esse nome para esse tipo" }, { status: 409 });
    }
    throw e;
  }
}
