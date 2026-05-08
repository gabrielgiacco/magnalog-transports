import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const skip = (page - 1) * limit;
  const q = searchParams.get("q");
  const entregaId = searchParams.get("entregaId");
  const semEntrega = searchParams.get("semEntrega") === "true";
  const emitenteCnpj = searchParams.get("emitenteCnpj");

  const where: any = {};
  if (q) {
    where.OR = [
      { numero: { contains: q } },
      { emitenteRazao: { contains: q, mode: "insensitive" } },
      { destinatarioRazao: { contains: q, mode: "insensitive" } },
      { chaveAcesso: { contains: q } },
    ];
  }
  if (entregaId) where.entregaId = entregaId;
  if (semEntrega) where.entregaId = null;
  if (emitenteCnpj) where.emitenteCnpj = emitenteCnpj;

  const [notas, total] = await Promise.all([
    prisma.notaFiscal.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        entrega: {
          select: { id: true, codigo: true, status: true, razaoSocial: true, cidade: true },
        },
      },
    }),
    prisma.notaFiscal.count({ where }),
  ]);

  return NextResponse.json({ notas, total, pages: Math.ceil(total / limit) });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { id, ids, entregaId } = body;

  // Support bulk linking: ids (array) or single id
  const notaIds: string[] = ids && Array.isArray(ids) ? ids : id ? [id] : [];
  if (notaIds.length === 0) {
    return NextResponse.json({ error: "Nenhuma nota informada" }, { status: 400 });
  }

  // Collect old entregaIds to recalculate their totals after unlinking
  const oldNotas = await prisma.notaFiscal.findMany({
    where: { id: { in: notaIds } },
    select: { entregaId: true },
  });
  const oldEntregaIds = Array.from(new Set(oldNotas.map(n => n.entregaId).filter(Boolean))) as string[];

  // Update all notas
  await prisma.notaFiscal.updateMany({
    where: { id: { in: notaIds } },
    data: { entregaId: entregaId || null },
  });

  // Recalculate totals for the target entrega and preserve dataChegada
  if (entregaId) {
    const [notasEntrega, entregaDestino] = await Promise.all([
      prisma.notaFiscal.findMany({
        where: { entregaId },
        select: { pesoBruto: true, volumes: true },
      }),
      prisma.entrega.findUnique({
        where: { id: entregaId },
        select: { dataChegada: true },
      }),
    ]);
    const updateData: any = {
      pesoTotal: notasEntrega.reduce((s: number, n: any) => s + n.pesoBruto, 0),
      volumeTotal: notasEntrega.reduce((s: number, n: any) => s + n.volumes, 0),
    };
    // Se a entrega destino não tem dataChegada, definir como agora
    if (!entregaDestino?.dataChegada) {
      updateData.dataChegada = new Date();
    }
    await prisma.entrega.update({
      where: { id: entregaId },
      data: updateData,
    });
  }

  // Recalculate totals for any old entregas that lost notas
  for (const oldId of oldEntregaIds) {
    if (oldId === entregaId) continue;
    const notasRestantes = await prisma.notaFiscal.findMany({
      where: { entregaId: oldId },
      select: { pesoBruto: true, volumes: true },
    });
    await prisma.entrega.update({
      where: { id: oldId },
      data: {
        pesoTotal: notasRestantes.reduce((s: number, n: any) => s + n.pesoBruto, 0),
        volumeTotal: notasRestantes.reduce((s: number, n: any) => s + n.volumes, 0),
      },
    });
  }

  return NextResponse.json({ updated: notaIds.length });
}
