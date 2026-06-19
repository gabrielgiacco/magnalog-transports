import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const clienteCnpj = searchParams.get("clienteCnpj");
    const fornecedorCnpj = searchParams.get("fornecedorCnpj");

    const where: any = {};

    if (clienteCnpj) where.clienteCnpj = clienteCnpj;
    if (fornecedorCnpj) where.fornecedorCnpj = fornecedorCnpj;

    if (q) {
      where.OR = [
        { codigoProduto: { contains: q, mode: "insensitive" } },
        { descricao: { contains: q, mode: "insensitive" } },
        { clienteCnpj: { contains: q } },
        { fornecedorCnpj: { contains: q } }
      ];
    }

    const normas = await prisma.normaPaletizacao.findMany({
      where,
      orderBy: [
        { clienteCnpj: "asc" },
        { fornecedorCnpj: "asc" },
        { codigoProduto: "asc" }
      ]
    });

    return NextResponse.json({ normas });
  } catch (error) {
    console.error("Erro ao listar normas:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const { action, items, clienteCnpj, fornecedorCnpj, codigoProduto, descricao, embalagem, lastro, altura, quantidadeCaixasPalete } = body;

    // Importação em lote
    if (action === "import") {
      if (!Array.isArray(items) || !clienteCnpj || !fornecedorCnpj) {
        return NextResponse.json({ error: "Parâmetros de importação inválidos" }, { status: 400 });
      }

      const upserts = items.map((item: any) => {
        const codProd = String(item.codigoProduto).trim();
        const l = parseInt(String(item.lastro)) || 0;
        const a = parseInt(String(item.altura)) || 0;
        const total = parseInt(String(item.quantidadeCaixasPalete)) || (l * a);

        return prisma.normaPaletizacao.upsert({
          where: {
            clienteCnpj_fornecedorCnpj_codigoProduto: {
              clienteCnpj: String(clienteCnpj).replace(/\D/g, ""),
              fornecedorCnpj: String(fornecedorCnpj).replace(/\D/g, ""),
              codigoProduto: codProd
            }
          },
          update: {
            descricao: item.descricao || null,
            embalagem: item.embalagem || null,
            lastro: l,
            altura: a,
            quantidadeCaixasPalete: total
          },
          create: {
            clienteCnpj: String(clienteCnpj).replace(/\D/g, ""),
            fornecedorCnpj: String(fornecedorCnpj).replace(/\D/g, ""),
            codigoProduto: codProd,
            descricao: item.descricao || null,
            embalagem: item.embalagem || null,
            lastro: l,
            altura: a,
            quantidadeCaixasPalete: total
          }
        });
      });

      await prisma.$transaction(upserts);
      return NextResponse.json({ success: true, count: items.length });
    }

    // Cadastro individual manual
    if (!clienteCnpj || !fornecedorCnpj || !codigoProduto) {
      return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    const l = parseInt(String(lastro)) || 0;
    const a = parseInt(String(altura)) || 0;
    const total = parseInt(String(quantidadeCaixasPalete)) || (l * a);

    const cleanClienteCnpj = String(clienteCnpj).replace(/\D/g, "");
    const cleanFornecedorCnpj = String(fornecedorCnpj).replace(/\D/g, "");

    const norma = await prisma.normaPaletizacao.upsert({
      where: {
        clienteCnpj_fornecedorCnpj_codigoProduto: {
          clienteCnpj: cleanClienteCnpj,
          fornecedorCnpj: cleanFornecedorCnpj,
          codigoProduto: String(codigoProduto).trim()
        }
      },
      update: {
        descricao: descricao || null,
        embalagem: embalagem || null,
        lastro: l,
        altura: a,
        quantidadeCaixasPalete: total
      },
      create: {
        clienteCnpj: cleanClienteCnpj,
        fornecedorCnpj: cleanFornecedorCnpj,
        codigoProduto: String(codigoProduto).trim(),
        descricao: descricao || null,
        embalagem: embalagem || null,
        lastro: l,
        altura: a,
        quantidadeCaixasPalete: total
      }
    });

    return NextResponse.json({ success: true, norma });
  } catch (error) {
    console.error("Erro ao cadastrar norma:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const { id, clienteCnpj, fornecedorCnpj, codigoProduto, lastro, altura, quantidadeCaixasPalete, descricao, embalagem } = body;

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const l = parseInt(String(lastro)) || 0;
    const a = parseInt(String(altura)) || 0;
    const total = parseInt(String(quantidadeCaixasPalete)) || (l * a);

    // Validação de duplicidade se CNPJs e Código forem alterados
    if (clienteCnpj && fornecedorCnpj && codigoProduto) {
      const cleanClienteCnpj = String(clienteCnpj).replace(/\D/g, "");
      const cleanFornecedorCnpj = String(fornecedorCnpj).replace(/\D/g, "");
      const cleanCodigo = String(codigoProduto).trim();

      const existing = await prisma.normaPaletizacao.findFirst({
        where: {
          clienteCnpj: cleanClienteCnpj,
          fornecedorCnpj: cleanFornecedorCnpj,
          codigoProduto: cleanCodigo,
          NOT: { id }
        }
      });

      if (existing) {
        return NextResponse.json({ error: "Já existe uma norma cadastrada para este Cliente, Fornecedor e Produto" }, { status: 400 });
      }
    }

    const norma = await prisma.normaPaletizacao.update({
      where: { id },
      data: {
        clienteCnpj: clienteCnpj ? String(clienteCnpj).replace(/\D/g, "") : undefined,
        fornecedorCnpj: fornecedorCnpj ? String(fornecedorCnpj).replace(/\D/g, "") : undefined,
        codigoProduto: codigoProduto ? String(codigoProduto).trim() : undefined,
        descricao: descricao !== undefined ? (descricao || null) : undefined,
        embalagem: embalagem !== undefined ? (embalagem || null) : undefined,
        lastro: l,
        altura: a,
        quantidadeCaixasPalete: total
      }
    });

    return NextResponse.json({ success: true, norma });
  } catch (error: any) {
    console.error("Erro ao atualizar norma:", error);
    return NextResponse.json({ error: error.message || "Erro interno no servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });

    await prisma.normaPaletizacao.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir norma:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
