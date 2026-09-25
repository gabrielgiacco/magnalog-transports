import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseProdutosDoXml } from "@/lib/nf-produtos";

export const dynamic = "force-dynamic";

// Decodifica entidades HTML na descrição: um registro real de produção está
// gravado como "FRALDA CALCA DIA&amp;NOITE - XXG22 X 4P" porque o XML do
// fornecedor veio codificado em dobro, e sem isso o "&amp;NOITE" aparece
// literalmente na tela. Decodificar na leitura resolve a exibição sem tocar
// no dado gravado.
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

interface ProdutoResposta {
  codigo: string;
  descricao: string;
  ncm: string | null;
  unidade: string | null;
  quantidadeNF: number | null;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const item = await prisma.depositoItem.findUnique({
    where: { id: params.id },
    select: { id: true, avariaId: true, notaFiscalId: true },
  });
  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  let fonte: "AVARIA" | "NOTA_FISCAL" | "NENHUMA" = "NENHUMA";
  let produtos: ProdutoResposta[] = [];

  // 1) avaria vinculada — fonte mais rica, usada sempre que existir e tiver linhas.
  if (item.avariaId) {
    const avariaProdutos = await prisma.avariaProduto.findMany({
      where: { avariaId: item.avariaId },
      orderBy: { descricao: "asc" },
    });
    if (avariaProdutos.length > 0) {
      fonte = "AVARIA";
      produtos = avariaProdutos.map((p) => ({
        codigo: p.codigoProduto,
        descricao: decodeHtmlEntities(p.descricao),
        ncm: p.ncm,
        unidade: p.unidade,
        quantidadeNF: p.quantidadeNF,
        quantidade: p.quantidadeAvaria,
        valorUnitario: p.valorUnitario,
        valorTotal: p.valorTotal,
      }));
    }
  }

  // 2) sem avaria (ou avaria sem produtos) — cai para o XML da NF.
  if (fonte === "NENHUMA" && item.notaFiscalId) {
    const nf = await prisma.notaFiscal.findUnique({
      where: { id: item.notaFiscalId },
      select: { xmlOriginal: true },
    });
    const produtosNF = parseProdutosDoXml(nf?.xmlOriginal);
    if (produtosNF.length > 0) {
      fonte = "NOTA_FISCAL";
      produtos = produtosNF.map((p) => ({
        codigo: p.codigo,
        descricao: decodeHtmlEntities(p.descricao),
        ncm: p.ncm,
        unidade: p.unidade,
        quantidadeNF: null,
        quantidade: p.quantidade,
        valorUnitario: p.valorUnitario,
        valorTotal: p.valorTotal,
      }));
    }
  }

  const totalValor = produtos.reduce((s, p) => s + p.valorTotal, 0);

  return NextResponse.json({ fonte, produtos, totalValor });
}
