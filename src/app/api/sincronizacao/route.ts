import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { listarChaves, MeuDanfeError } from "@/lib/meudanfe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Compara um bloco de chaves da Area do Cliente do Meu Danfe com o que ja
 * existe no TMS. GRATIS — /fd/my/{tipo} nao e cobrado.
 *
 * A listagem e por cursor: sem `recomecar`, continua da `ultimaChave` guardada
 * no marcador (sem limite de chamadas). Com `recomecar=1`, ou quando ainda nao
 * ha marcador, e um recomeco do zero — a API so permite 1 por hora por tipo, e
 * o guard fica ANTES da chamada: insistir sem esperar empurra o horario de
 * liberacao para frente, entao nunca tentamos e vemos no que da.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const tipo = (searchParams.get("tipo") || "NFE").toUpperCase() as "NFE" | "CTE";
  const recomecar = searchParams.get("recomecar") === "1";

  if (tipo !== "NFE" && tipo !== "CTE") {
    return NextResponse.json({ error: "Tipo deve ser NFE ou CTE." }, { status: 400 });
  }

  try {
    const marcador = await prisma.sincronizacaoMarcador.upsert({
      where: { tipo },
      update: {},
      create: { tipo },
    });

    const vaiRecomecar = recomecar || !marcador.ultimaChave;

    if (vaiRecomecar && marcador.ultimaVarreduraEm) {
      const liberadoEm = new Date(marcador.ultimaVarreduraEm.getTime() + 60 * 60 * 1000);
      if (liberadoEm.getTime() > Date.now()) {
        return NextResponse.json(
          {
            error: `Recomeço da listagem bloqueado até ${liberadoEm.toLocaleString("pt-BR")}. Aguarde antes de tentar de novo.`,
            liberadoEm: liberadoEm.toISOString(),
          },
          { status: 429 }
        );
      }
    }

    const bloco = await listarChaves(tipo, vaiRecomecar ? null : marcador.ultimaChave);

    // Quais dessas chaves ja existem aqui?
    const existentes = tipo === "NFE"
      ? await prisma.notaFiscal.findMany({
          where: { chaveAcesso: { in: bloco.chaves } },
          select: { chaveAcesso: true },
        })
      : await prisma.cTe.findMany({
          where: { chaveAcesso: { in: bloco.chaves } },
          select: { chaveAcesso: true },
        });

    const jaTemos = new Set(existentes.map((e) => e.chaveAcesso));

    const agora = new Date();
    const marcadorAtualizado = await prisma.sincronizacaoMarcador.update({
      where: { tipo },
      data: {
        ultimaChave: bloco.ultimaChave ?? marcador.ultimaChave,
        ultimoBlocoEm: agora,
        ...(vaiRecomecar ? { ultimaVarreduraEm: agora } : {}),
        chavesVistas: vaiRecomecar ? bloco.chaves.length : { increment: bloco.chaves.length },
      },
    });

    return NextResponse.json({
      tipo,
      chaves: bloco.chaves.map((chave) => ({ chave, existe: jaTemos.has(chave) })),
      fim: bloco.fim,
      ultimaChave: bloco.ultimaChave,
      recomecou: vaiRecomecar,
      chavesVistas: marcadorAtualizado.chavesVistas,
      marcador: {
        ultimaChave: marcadorAtualizado.ultimaChave,
        ultimaVarreduraEm: marcadorAtualizado.ultimaVarreduraEm,
        ultimoBlocoEm: marcadorAtualizado.ultimoBlocoEm,
      },
    });
  } catch (e: any) {
    if (e instanceof MeuDanfeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[sincronizacao] erro:", e);
    return NextResponse.json({ error: "Erro ao listar documentos do Meu Danfe." }, { status: 500 });
  }
}
