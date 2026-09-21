import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { extractRequestMeta } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { VISITA_ABERTA_ATE_MS, statusDoSinal } from "@/lib/presenca";

export const dynamic = "force-dynamic";

// pathname vem do navegador: limita o tamanho e exige forma de rota.
const MAX_TELA = 200;
const usuario = { select: { name: true, email: true, role: true } };

/** Sinal do navegador: atualiza a visita aberta do usuario ou abre uma nova. */
export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const tela =
    typeof body?.tela === "string" && body.tela.startsWith("/") ? body.tela.slice(0, MAX_TELA) : "/";
  const agora = new Date();
  const limite = new Date(agora.getTime() - VISITA_ABERTA_ATE_MS);

  const aberta = await prisma.presencaVisita.findFirst({
    where: { userId: auth.user.id, ultimoSinal: { gte: limite } },
    orderBy: { ultimoSinal: "desc" },
    select: { id: true },
  });

  if (aberta) {
    await prisma.presencaVisita.update({ where: { id: aberta.id }, data: { ultimoSinal: agora, tela } });
  } else {
    const { ip, userAgent } = extractRequestMeta(req);
    await prisma.presencaVisita.create({
      data: { userId: auth.user.id, inicio: agora, ultimoSinal: agora, tela, ip, userAgent },
    });
  }
  return new NextResponse(null, { status: 204 });
}

/**
 * Sem parametro: quem esta online agora (uma visita aberta por usuario).
 * Com inicio/fim em ISO: visitas que tocam o intervalo — o cliente calcula o
 * dia no fuso dele, porque o servidor da Vercel roda em UTC.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApi(["ADMIN"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const inicioParam = searchParams.get("inicio");
  const fimParam = searchParams.get("fim");
  const limiteAberta = new Date(Date.now() - VISITA_ABERTA_ATE_MS);

  if (inicioParam || fimParam) {
    if (!inicioParam || !fimParam) {
      return NextResponse.json({ error: "informe inicio e fim juntos" }, { status: 400 });
    }
  }

  if (inicioParam && fimParam) {
    const inicio = new Date(inicioParam);
    const fim = new Date(fimParam);
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
      return NextResponse.json({ error: "inicio/fim inválidos" }, { status: 400 });
    }
    const visitas = await prisma.presencaVisita.findMany({
      where: { inicio: { lte: fim }, ultimoSinal: { gte: inicio } },
      orderBy: { inicio: "desc" },
      take: 500,
      include: { user: usuario },
    });
    return NextResponse.json({
      visitas: visitas.map((v) => ({ ...v, aberta: v.ultimoSinal >= limiteAberta })),
    });
  }

  const abertas = await prisma.presencaVisita.findMany({
    where: { ultimoSinal: { gte: limiteAberta } },
    orderBy: { ultimoSinal: "desc" },
    include: { user: usuario },
  });
  const vistos = new Set<string>();
  // Duas abas abertas no mesmo instante podem criar duas visitas; na lista de
  // "agora" vale a mais recente de cada usuario.
  const online = abertas.filter((v) => (vistos.has(v.userId) ? false : (vistos.add(v.userId), true)));
  return NextResponse.json({
    online: online.map((v) => ({ ...v, status: statusDoSinal(v.ultimoSinal) })),
  });
}
