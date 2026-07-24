import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { buildObjectKey, presignPut, presignGet } from "@/lib/r2";

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB por arquivo
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf",
]);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const anexos = await prisma.anexoEntrega.findMany({
    where: { entregaId: params.id },
    orderBy: { createdAt: "desc" },
    include: { uploadadoPor: { select: { id: true, name: true } } },
  });

  const comUrls = await Promise.all(
    anexos.map(async (a) => ({
      ...a,
      url: await presignGet(a.objectKey, 3600),
    }))
  );

  return NextResponse.json(comUrls);
}

// Passo 1: cliente pede uma URL presignada pra fazer upload direto ao R2
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { filename, mimeType, size, tipo, descricao } = body;

  if (!filename || !mimeType || typeof size !== "number") {
    return NextResponse.json({ error: "filename, mimeType e size são obrigatórios" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido (jpg, png, webp, pdf)" }, { status: 400 });
  }
  if (size > MAX_SIZE) {
    return NextResponse.json({ error: `Arquivo excede ${MAX_SIZE / 1024 / 1024}MB` }, { status: 400 });
  }

  const entrega = await prisma.entrega.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  try {
    const objectKey = buildObjectKey(params.id, filename);
    const uploadUrl = await presignPut(objectKey, mimeType, 300);
    return NextResponse.json({ uploadUrl, objectKey });
  } catch (e: any) {
    console.error("R2 presign error:", e);
    return NextResponse.json(
      { error: e?.message || "Erro ao configurar upload no R2. Verifique as env vars R2_* na Vercel." },
      { status: 500 }
    );
  }
}

// Passo 2: cliente confirma o upload — cria o registro no DB
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const userId = (session.user as any).id || (session.user as any).userId;

  const body = await req.json();
  const { objectKey, filename, mimeType, size, tipo, descricao } = body;

  if (!objectKey || !filename || !mimeType) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  const anexo = await prisma.anexoEntrega.create({
    data: {
      entregaId: params.id,
      tipo: tipo || "CANHOTO",
      objectKey,
      filename,
      mimeType,
      size: size || 0,
      descricao: descricao || null,
      uploadadoPorId: userId || null,
    },
    include: { uploadadoPor: { select: { id: true, name: true } } },
  });

  // Se for canhoto, marca statusCanhoto = RECEBIDO
  if ((tipo || "CANHOTO") === "CANHOTO") {
    await prisma.entrega.update({
      where: { id: params.id },
      data: { statusCanhoto: "RECEBIDO" },
    });
  }

  const url = await presignGet(anexo.objectKey, 3600);
  return NextResponse.json({ ...anexo, url }, { status: 201 });
}
