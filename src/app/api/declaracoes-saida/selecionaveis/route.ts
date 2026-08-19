import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Itens que ainda podem sair: avarias não resolvidas, notas de devolução
 * pendentes e ocorrências em aberto. Mesmo shape para as três origens, para
 * a tela renderizar tudo igual.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [avarias, devolucoes, ocorrencias] = await Promise.all([
    prisma.avaria.findMany({
      where: { status: { not: "RESOLVIDA" } },
      orderBy: { dataOcorrencia: "desc" },
      take: 300,
      select: {
        id: true, codigo: true, descricao: true, valorPrejuizo: true, tipo: true,
        entrega: { select: { razaoSocial: true } },
      },
    }),
    prisma.notaDevolucao.findMany({
      where: { status: "PENDENTE" },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, numero: true, emitenteRazao: true, valorNota: true },
    }),
    prisma.ocorrencia.findMany({
      where: { resolvida: false },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true, tipo: true, descricao: true,
        entrega: { select: { codigo: true, razaoSocial: true } },
      },
    }),
  ]);

  return NextResponse.json({
    AVARIA: avarias.map((a) => ({
      id: a.id,
      referencia: a.codigo,
      descricao: a.descricao,
      detalhe: a.entrega?.razaoSocial || a.tipo,
      valor: a.valorPrejuizo || 0,
    })),
    DEVOLUCAO: devolucoes.map((d) => ({
      id: d.id,
      referencia: `NF ${d.numero}`,
      descricao: d.emitenteRazao,
      detalhe: "",
      valor: d.valorNota || 0,
    })),
    OCORRENCIA: ocorrencias.map((o) => ({
      id: o.id,
      referencia: o.entrega?.codigo || "—",
      descricao: `${o.tipo} — ${o.descricao}`,
      detalhe: o.entrega?.razaoSocial || "",
      valor: 0,
    })),
  });
}
