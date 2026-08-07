import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/r2";

// Portal cliente: só vê anexos de entregas cujo emitente esteja autorizado ao usuário
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sessionUser = session.user as any;

  const autorizados = await prisma.fornecedorAutorizado.findMany({
    where: { userId: sessionUser.id },
    select: { cnpjEmitente: true },
  });
  const cnpjs = autorizados.map((a: any) => a.cnpjEmitente);
  if (!cnpjs.length) return NextResponse.json([]);

  const entrega = await prisma.entrega.findFirst({
    where: {
      id: params.id,
      notas: { some: { emitenteCnpj: { in: cnpjs } } },
    },
    select: { id: true },
  });
  if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  const anexos = await prisma.anexoEntrega.findMany({
    where: { entregaId: params.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, tipo: true, filename: true, mimeType: true, size: true,
      descricao: true, createdAt: true, objectKey: true,
    },
  });

  const comUrls = await Promise.all(
    anexos.map(async (a) => {
      const { objectKey, ...rest } = a;
      return { ...rest, origem: "ENTREGA" as const, url: await presignGet(objectKey, 3600) };
    })
  );

  // Ressalvas — anexos de avaria que o operador liberou explicitamente para o cliente.
  // Só vazam os dados de contexto (tipo, data, descrição); valor do prejuízo e status
  // da avaria são internos e não podem ser serializados aqui.
  const avarias = await prisma.avaria.findMany({
    where: { entregaId: params.id },
    select: { id: true, codigo: true, tipo: true, dataOcorrencia: true, descricao: true },
  });

  let ressalvas: any[] = [];
  if (avarias.length) {
    const porId = new Map(avarias.map((a) => [a.id, a]));
    const anexosAvaria = await prisma.anexo.findMany({
      where: {
        ownerType: "AVARIA",
        ownerId: { in: avarias.map((a) => a.id) },
        visivelPortal: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, tipo: true, filename: true, mimeType: true, size: true,
        descricao: true, createdAt: true, objectKey: true, ownerId: true,
      },
    });

    ressalvas = await Promise.all(
      anexosAvaria.map(async (a) => {
        const { objectKey, ownerId, ...rest } = a;
        const av = porId.get(ownerId);
        return {
          ...rest,
          origem: "AVARIA" as const,
          avaria: av
            ? { codigo: av.codigo, tipo: av.tipo, dataOcorrencia: av.dataOcorrencia, descricao: av.descricao }
            : null,
          url: await presignGet(objectKey, 3600),
        };
      })
    );
  }

  const todos = [...comUrls, ...ressalvas].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return NextResponse.json(todos);
}
