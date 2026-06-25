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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const data: any = {};
  if (typeof body.nome === "string") data.nome = body.nome.trim();
  if (typeof body.ordem === "number") data.ordem = body.ordem;
  if (typeof body.ativo === "boolean") data.ativo = body.ativo;

  try {
    const cat = await prisma.categoriaFinanceira.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(cat);
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Já existe uma categoria com esse nome para esse tipo" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const cat = await prisma.categoriaFinanceira.findUnique({
    where: { id: params.id },
    include: { _count: { select: { lancamentos: true } } },
  });

  if (!cat) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
  if (cat.sistema) {
    return NextResponse.json({ error: "Categorias do sistema não podem ser apagadas. Desative se não usa." }, { status: 400 });
  }
  if (cat._count.lancamentos > 0) {
    return NextResponse.json({ error: "Categoria possui lançamentos vinculados. Desative ao invés de apagar." }, { status: 400 });
  }

  await prisma.categoriaFinanceira.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

// Sub-rotas: criação de subcategorias
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body.nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

  try {
    const sub = await prisma.subcategoriaFinanceira.create({
      data: { categoriaId: params.id, nome: body.nome.trim(), ativo: true },
    });
    return NextResponse.json(sub, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Já existe subcategoria com esse nome" }, { status: 409 });
    }
    throw e;
  }
}
