import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { gerarToken, tokenValido, TOKEN_DURACAO_MS } from "@/lib/upload-token";

/**
 * Link do motorista para a rota inteira. Espelha /api/entregas/[id]/upload-token
 * com uma diferença: gerar o link da rota também garante um token válido em
 * cada entrega dela, porque a página da parada reaproveita o link por entrega.
 */

// GET — token atual da rota, se ainda válido
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const rota = await prisma.rota.findUnique({
    where: { id: params.id },
    select: { uploadToken: true, uploadTokenExpira: true },
  });
  if (!rota) return NextResponse.json({ error: "Rota não encontrada" }, { status: 404 });

  const valido = tokenValido(rota.uploadToken, rota.uploadTokenExpira);
  return NextResponse.json({
    token: valido ? rota.uploadToken : null,
    expira: valido ? rota.uploadTokenExpira : null,
  });
}

// POST — gera o link da rota e alinha os tokens das entregas à mesma validade
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const rota = await prisma.rota.findUnique({
    where: { id: params.id },
    select: {
      id: true, status: true,
      entregas: { select: { id: true, uploadToken: true, uploadTokenExpira: true } },
    },
  });
  if (!rota) return NextResponse.json({ error: "Rota não encontrada" }, { status: 404 });
  if (rota.status === "CANCELADA") return NextResponse.json({ error: "ROTA_CANCELADA" }, { status: 409 });
  if (rota.entregas.length === 0) return NextResponse.json({ error: "ROTA_SEM_ENTREGAS" }, { status: 400 });

  const token = gerarToken();
  const expira = new Date(Date.now() + TOKEN_DURACAO_MS);

  await prisma.$transaction([
    prisma.rota.update({ where: { id: rota.id }, data: { uploadToken: token, uploadTokenExpira: expira } }),
    // Token de entrega ainda válido é mantido (um link já enviado ao motorista
    // continua funcionando); a validade é estendida para a da rota. Sem token
    // válido, gera um novo.
    ...rota.entregas.map((e) =>
      prisma.entrega.update({
        where: { id: e.id },
        data: {
          uploadToken: tokenValido(e.uploadToken, e.uploadTokenExpira) ? e.uploadToken : gerarToken(),
          uploadTokenExpira: expira,
        },
      })
    ),
  ]);

  return NextResponse.json({ token, expira, entregas: rota.entregas.length }, { status: 201 });
}

// DELETE — revoga o link da rota E os das entregas dela
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const rota = await prisma.rota.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!rota) return NextResponse.json({ error: "Rota não encontrada" }, { status: 404 });

  await prisma.$transaction([
    prisma.rota.update({ where: { id: rota.id }, data: { uploadToken: null, uploadTokenExpira: null } }),
    prisma.entrega.updateMany({ where: { rotaId: rota.id }, data: { uploadToken: null, uploadTokenExpira: null } }),
  ]);

  return NextResponse.json({ ok: true });
}
