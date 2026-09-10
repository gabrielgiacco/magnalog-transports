import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildObjectKey, presignPut, presignGet } from "@/lib/r2";

const MAX_SIZE = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf",
]);

async function validarToken(token: string) {
  if (!token) return null;
  const entrega = await prisma.entrega.findUnique({
    where: { uploadToken: token },
    select: {
      id: true, codigo: true, razaoSocial: true, cidade: true, uf: true,
      dataAgendada: true, uploadTokenExpira: true, statusCanhoto: true,
      notas: { select: { numero: true, emitenteRazao: true } },
      motorista: { select: { id: true, nome: true } },
    },
  });
  if (!entrega) return null;
  if (!entrega.uploadTokenExpira || entrega.uploadTokenExpira < new Date()) return null;
  return entrega;
}

// GET — mostra info da entrega + anexos já enviados (usada pelo /upload/[token] page)
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const entrega = await validarToken(params.token);
  if (!entrega) return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });

  const anexos = await prisma.anexoEntrega.findMany({
    where: { entregaId: entrega.id, tipo: "CANHOTO" },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, mimeType: true, size: true, createdAt: true, objectKey: true },
  });
  const comUrls = await Promise.all(
    anexos.map(async (a) => {
      const { objectKey, ...rest } = a;
      return { ...rest, url: await presignGet(objectKey, 3600) };
    })
  );

  const { uploadTokenExpira, ...safe } = entrega;
  return NextResponse.json({ entrega: safe, anexos: comUrls, expira: uploadTokenExpira });
}

// POST — gera URL presignada de upload
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const entrega = await validarToken(params.token);
  if (!entrega) return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });

  const body = await req.json();
  const { filename, mimeType, size } = body;

  if (!filename || !mimeType || typeof size !== "number") {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json({ error: "Tipo não permitido (jpg, png, webp, pdf)" }, { status: 400 });
  }
  if (size > MAX_SIZE) {
    return NextResponse.json({ error: `Arquivo excede ${MAX_SIZE / 1024 / 1024}MB` }, { status: 400 });
  }

  try {
    const objectKey = buildObjectKey(entrega.id, filename);
    const uploadUrl = await presignPut(objectKey, mimeType, 300);
    return NextResponse.json({ uploadUrl, objectKey });
  } catch (e: any) {
    console.error("public presign error:", e);
    return NextResponse.json({ error: e?.message || "Erro no R2" }, { status: 500 });
  }
}

// PUT — confirma upload e persiste no DB (marca statusCanhoto=RECEBIDO)
export async function PUT(req: NextRequest, { params }: { params: { token: string } }) {
  const entrega = await validarToken(params.token);
  if (!entrega) return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });

  const body = await req.json();
  const { objectKey, filename, mimeType, size } = body;

  if (!objectKey || !filename || !mimeType) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  const anexo = await prisma.anexoEntrega.create({
    data: {
      entregaId: entrega.id,
      tipo: "CANHOTO",
      objectKey,
      filename,
      mimeType,
      size: size || 0,
      descricao: "Enviado pelo motorista via link mobile",
    },
  });

  await prisma.entrega.update({
    where: { id: entrega.id },
    data: { statusCanhoto: "RECEBIDO" },
  });

  const url = await presignGet(anexo.objectKey, 3600);
  const { objectKey: _ok, ...rest } = anexo;
  return NextResponse.json({ ...rest, url }, { status: 201 });
}

/**
 * PATCH — registra onde o motorista estava ao enviar o canhoto.
 *
 * Autorizado pelo mesmo token do link, que aponta para UMA entrega: a posição
 * amarra na entrega certa por construção, sem depender de casar telefone com
 * cadastro.
 *
 * O navegador só entrega coordenada depois que a pessoa aceita o pedido de
 * permissão — não existe leitura silenciosa, e é por isso que a página explica
 * para que serve antes de pedir.
 *
 * Append-only, e NUNCA toca Entrega.latitude/longitude: aqueles são o destino
 * geocodificado, que alimenta o planejador de rotas e o mapa.
 */
export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  const entrega = await validarToken(params.token);
  if (!entrega) return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });

  const body = await req.json();
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  // Zero não é coordenada de entrega no Brasil: é o Golfo da Guiné, e é o que
  // sai quando o valor vem vazio de algum lugar.
  const valida =
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude !== 0 && longitude !== 0 &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

  if (!valida) return NextResponse.json({ error: "Coordenada inválida" }, { status: 400 });

  const precisao = Number(body.precisaoM);

  const posicao = await prisma.posicaoEntrega.create({
    data: {
      entregaId: entrega.id,
      motoristaId: entrega.motorista?.id ?? null,
      latitude,
      longitude,
      precisaoM: Number.isFinite(precisao) && precisao > 0 ? precisao : null,
      origem: "UPLOAD_CANHOTO",
    },
  });

  return NextResponse.json({ id: posicao.id, registradaEm: posicao.registradaEm }, { status: 201 });
}
