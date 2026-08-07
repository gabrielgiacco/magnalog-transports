import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { buildObjectKey, presignPut, presignGet, deleteObject } from "@/lib/r2";
import { logFromRequest } from "@/lib/audit";

const MAX_SIZE = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf",
]);

export type OwnerType = "MOTORISTA" | "VEICULO" | "AVARIA";

interface Ctx {
  ownerType: OwnerType;
  ownerId: string;
}

/** GET — lista anexos com URLs presignadas */
export async function anexosList({ ownerType, ownerId }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const anexos = await prisma.anexo.findMany({
    where: { ownerType, ownerId },
    orderBy: { createdAt: "desc" },
    include: {
      uploadadoPor: { select: { id: true, name: true } },
      liberadoPor: { select: { id: true, name: true } },
    },
  });
  const comUrls = await Promise.all(
    anexos.map(async (a) => ({ ...a, url: await presignGet(a.objectKey, 3600) }))
  );
  return NextResponse.json(comUrls);
}

/** POST — gera URL presignada de upload */
export async function anexosPresign(req: NextRequest, { ownerType, ownerId }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { filename, mimeType, size } = body;

  if (!filename || !mimeType || typeof size !== "number") {
    return NextResponse.json({ error: "filename, mimeType e size são obrigatórios" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido (jpg, png, webp, pdf)" }, { status: 400 });
  }
  if (size > MAX_SIZE) {
    return NextResponse.json({ error: `Arquivo excede ${MAX_SIZE / 1024 / 1024}MB` }, { status: 400 });
  }

  try {
    const objectKey = buildObjectKey(`${ownerType.toLowerCase()}s/${ownerId}`, filename);
    const uploadUrl = await presignPut(objectKey, mimeType, 300);
    return NextResponse.json({ uploadUrl, objectKey });
  } catch (e: any) {
    console.error("R2 presign error:", e);
    return NextResponse.json({ error: e?.message || "Erro no R2" }, { status: 500 });
  }
}

/** PUT — confirma upload e persiste no DB */
export async function anexosConfirm(req: NextRequest, { ownerType, ownerId }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const userId = (session.user as any).id || (session.user as any).userId;

  const body = await req.json();
  const { objectKey, filename, mimeType, size, tipo, descricao } = body;

  if (!objectKey || !filename || !mimeType) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  const anexo = await prisma.anexo.create({
    data: {
      ownerType,
      ownerId,
      tipo: tipo || "OUTRO",
      objectKey,
      filename,
      mimeType,
      size: size || 0,
      descricao: descricao || null,
      uploadadoPorId: userId || null,
    },
    include: { uploadadoPor: { select: { id: true, name: true } } },
  });
  const url = await presignGet(anexo.objectKey, 3600);
  return NextResponse.json({ ...anexo, url }, { status: 201 });
}

/**
 * PATCH /[anexoId] — libera/oculta o anexo no portal do cliente.
 * Só faz sentido para anexos de avaria: documento de motorista/veículo nunca vai ao portal.
 */
export async function anexosSetVisibilidade(req: NextRequest, anexoId: string, { ownerType, ownerId }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const sessionUser = session.user as any;
  const userId = sessionUser.id || sessionUser.userId;

  if (ownerType !== "AVARIA") {
    return NextResponse.json({ error: "Visibilidade no portal só se aplica a anexos de avaria" }, { status: 400 });
  }

  const body = await req.json();
  const { visivelPortal } = body;
  if (typeof visivelPortal !== "boolean") {
    return NextResponse.json({ error: "visivelPortal (boolean) é obrigatório" }, { status: 400 });
  }

  const existente = await prisma.anexo.findUnique({ where: { id: anexoId } });
  if (!existente || existente.ownerType !== ownerType || existente.ownerId !== ownerId) {
    return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });
  }

  const anexo = await prisma.anexo.update({
    where: { id: anexoId },
    data: {
      visivelPortal,
      liberadoPorId: visivelPortal ? userId || null : null,
      liberadoEm: visivelPortal ? new Date() : null,
    },
    include: {
      uploadadoPor: { select: { id: true, name: true } },
      liberadoPor: { select: { id: true, name: true } },
    },
  });

  await logFromRequest(req, visivelPortal ? "ANEXO_LIBERADO_PORTAL" : "ANEXO_OCULTADO_PORTAL", {
    user: { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name, role: sessionUser.role },
    recursoTipo: "anexo",
    recursoId: anexo.id,
    recursoDesc: anexo.filename,
    detalhes: { avariaId: ownerId, tipo: anexo.tipo, visivelPortal },
  });

  const url = await presignGet(anexo.objectKey, 3600);
  return NextResponse.json({ ...anexo, url });
}

/** DELETE /[anexoId] — remove do R2 e DB */
export async function anexosDelete(anexoId: string, { ownerType, ownerId }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const anexo = await prisma.anexo.findUnique({ where: { id: anexoId } });
  if (!anexo || anexo.ownerType !== ownerType || anexo.ownerId !== ownerId) {
    return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });
  }
  try { await deleteObject(anexo.objectKey); } catch { /* ignore */ }
  await prisma.anexo.delete({ where: { id: anexoId } });
  return NextResponse.json({ ok: true });
}
