import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { listarChaves, MeuDanfeError } from "@/lib/meudanfe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Compara uma pagina de chaves da Area do Cliente do Meu Danfe com o que ja
 * existe no TMS. GRATIS — /fd/my/{tipo} nao e cobrado.
 *
 * A varredura e por pagina, dirigida pela tela, e nao de uma vez so: uma conta
 * com milhares de documentos daria dezenas de chamadas e estouraria o tempo da
 * funcao. Como a doc garante ordenacao da mais antiga para a mais recente, as
 * paginas ja lidas nao mudam quando entram documentos novos.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = (searchParams.get("tipo") || "NFE").toUpperCase() as "NFE" | "CTE";
  const pagina = Math.max(1, parseInt(searchParams.get("pagina") || "1"));
  const doc = searchParams.get("doc") || undefined;

  if (tipo !== "NFE" && tipo !== "CTE") {
    return NextResponse.json({ error: "Tipo deve ser NFE ou CTE." }, { status: 400 });
  }

  try {
    const pag = await listarChaves(tipo, pagina, doc);

    // Quais dessas chaves ja existem aqui?
    const existentes = tipo === "NFE"
      ? await prisma.notaFiscal.findMany({
          where: { chaveAcesso: { in: pag.chaves } },
          select: { chaveAcesso: true },
        })
      : await prisma.cTe.findMany({
          where: { chaveAcesso: { in: pag.chaves } },
          select: { chaveAcesso: true },
        });

    const jaTemos = new Set(existentes.map((e) => e.chaveAcesso));

    return NextResponse.json({
      tipo,
      pagina: pag.pagina,
      totalPaginas: pag.totalPaginas,
      totalDocumentos: pag.totalDocumentos,
      chaves: pag.chaves.map((chave) => ({ chave, existe: jaTemos.has(chave) })),
    });
  } catch (e: any) {
    if (e instanceof MeuDanfeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[sincronizacao] erro:", e);
    return NextResponse.json({ error: "Erro ao listar documentos do Meu Danfe." }, { status: 500 });
  }
}
