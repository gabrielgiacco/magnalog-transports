import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

/** Detalhe: inclui quais documentos manifestados ja existem no TMS. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const mdfe = await prisma.mdfe.findUnique({
    where: { id: params.id },
    include: {
      rota: { select: { id: true, codigo: true, data: true } },
      documentos: { orderBy: [{ municipioDescarga: "asc" }, { chaveAcesso: "asc" }] },
    },
  });
  if (!mdfe) return NextResponse.json({ error: "MDF-e nao encontrado" }, { status: 404 });

  // Cruza as chaves manifestadas com o que ja foi importado.
  const chaves = mdfe.documentos.map((d) => d.chaveAcesso);
  const [ctes, nfs] = await Promise.all([
    prisma.cTe.findMany({ where: { chaveAcesso: { in: chaves } }, select: { chaveAcesso: true, numero: true } }),
    prisma.notaFiscal.findMany({ where: { chaveAcesso: { in: chaves } }, select: { chaveAcesso: true, numero: true } }),
  ]);
  const achados = new Map<string, string>();
  for (const c of ctes) achados.set(c.chaveAcesso, c.numero);
  for (const n of nfs) achados.set(n.chaveAcesso, n.numero);

  return NextResponse.json({
    ...mdfe,
    documentos: mdfe.documentos.map((d) => ({
      ...d,
      numeroNoTms: achados.get(d.chaveAcesso) || null,
      existeNoTms: achados.has(d.chaveAcesso),
    })),
    documentosNoTms: achados.size,
  });
}

/** Encerrar manualmente ou vincular/desvincular rota. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: any = {};

  if (body.encerrar === true) {
    data.status = "ENCERRADO";
    data.encerradoEm = body.encerradoEm ? new Date(body.encerradoEm) : new Date();
    // MANUAL deixa claro que nao houve documento fiscal comprovando.
    data.encerradoPor = "MANUAL";
  } else if (body.encerrar === false) {
    data.status = "AUTORIZADO";
    data.encerradoEm = null;
    data.encerradoPor = null;
    data.protocoloEncerramento = null;
  }

  if (body.rotaId !== undefined) data.rotaId = body.rotaId || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const mdfe = await prisma.mdfe.update({ where: { id: params.id }, data });
  return NextResponse.json(mdfe);
}
