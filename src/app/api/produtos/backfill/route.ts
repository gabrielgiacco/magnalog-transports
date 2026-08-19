import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { indexarProdutosDoXml } from "@/lib/produto-catalogo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const BATCH = 200;
  let cursor: string | undefined = undefined;
  let processadas = 0;
  let produtosIndexados = 0;

  while (true) {
    const notas: { id: string; xmlOriginal: string | null; emitenteCnpj: string; emitenteRazao: string | null; dataEmissao: Date | null }[] = await prisma.notaFiscal.findMany({
      where: { xmlOriginal: { not: null } },
      select: { id: true, xmlOriginal: true, emitenteCnpj: true, emitenteRazao: true, dataEmissao: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (notas.length === 0) break;

    for (const nf of notas) {
      const count = await indexarProdutosDoXml(nf.xmlOriginal, nf.emitenteCnpj, nf.emitenteRazao, nf.dataEmissao);
      produtosIndexados += count;
      processadas++;
    }
    cursor = notas[notas.length - 1].id;
    if (notas.length < BATCH) break;
  }

  const total = await prisma.produtoCatalogo.count();
  return NextResponse.json({ ok: true, notasProcessadas: processadas, produtosIndexados, totalNoBanco: total });
}
