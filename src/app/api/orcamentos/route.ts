import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function exigirAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if ((session.user as any)?.role !== "ADMIN") {
    return { erro: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { userId: (session.user as any).id || (session.user as any).userId };
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limite") || "50"), 100);

  const orcamentos = await prisma.orcamento.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      criadoPor: { select: { id: true, name: true } },
      _count: { select: { itens: true } },
    },
  });

  return NextResponse.json({ orcamentos });
}

/** Próximo código a partir do MAIOR existente — count() repetiria após exclusão. */
async function proximoCodigo(tx: any) {
  const ultimo = await tx.orcamento.findFirst({
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  });
  const n = ultimo ? parseInt(ultimo.codigo.slice(4), 10) + 1 : 1;
  return `ORC-${String(n).padStart(5, "0")}`;
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const body = await req.json();
  const { observacoes, itens } = body;

  if (!Array.isArray(itens) || itens.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um produto" }, { status: 400 });
  }

  // Quantidade vem do cliente; preço não. O servidor lê o catálogo pelos ids
  // para o navegador não conseguir forjar o valor impresso.
  const porId = new Map<string, number>();
  for (const i of itens) {
    const qtd = Number(i.quantidade);
    if (!i.produtoCatalogoId || !isFinite(qtd) || qtd <= 0) {
      return NextResponse.json({ error: "Item inválido: id e quantidade > 0 são obrigatórios" }, { status: 400 });
    }
    porId.set(i.produtoCatalogoId, qtd);
  }

  const produtos = await prisma.produtoCatalogo.findMany({
    where: { id: { in: Array.from(porId.keys()) } },
  });
  if (produtos.length === 0) {
    return NextResponse.json({ error: "Nenhum produto encontrado para os ids enviados" }, { status: 400 });
  }

  const linhas = produtos.map((p) => {
    const quantidade = porId.get(p.id)!;
    const valorUnitario = p.valorUnitario ?? 0;
    return {
      produtoCatalogoId: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      fornecedorNome: p.fornecedorNome,
      fornecedorCnpj: p.fornecedorCnpj,
      unidade: p.unidade,
      valorUnitario,
      valorUnitarioEm: p.valorUnitarioEm,
      quantidade,
      valorTotal: valorUnitario * quantidade,
    };
  });

  const valorTotal = linhas.reduce((s, l) => s + l.valorTotal, 0);

  try {
    const criado = await prisma.$transaction(async (tx) => {
      return tx.orcamento.create({
        data: {
          codigo: await proximoCodigo(tx),
          observacoes: observacoes || null,
          valorTotal,
          criadoPorId: auth.userId!,
          itens: { create: linhas },
        },
        include: { itens: true },
      });
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (e: any) {
    console.error("[orcamento] erro ao criar:", e);
    return NextResponse.json({ error: e?.message || "Erro ao criar orçamento" }, { status: 500 });
  }
}
