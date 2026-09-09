import { NextRequest, NextResponse } from "next/server";
import { receberWebhook } from "@/lib/whatsapp/webhook";

// Precisa de node:crypto e do Prisma — não roda no runtime edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Entrada de mensagens do WhatsApp. Rota pública por definição: quem chama é o
 * provedor, não um usuário logado. A autorização é a assinatura HMAC conferida
 * dentro de receberWebhook.
 *
 * O corpo é lido como TEXTO CRU. Chamar req.json() antes destruiria a
 * formatação exata que a assinatura cobre, e nenhum HMAC fecharia.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const { status, corpo } = await receberWebhook(raw, req.headers);
  return NextResponse.json(corpo, { status });
}

/**
 * Alguns provedores validam o endpoint com um GET antes de começar a entregar.
 * Responder 200 em texto puro é o suficiente para o Pingo; a verificação por
 * desafio da Cloud API da Meta entra junto com o adaptador dela.
 */
export async function GET() {
  return new NextResponse("ok", { status: 200 });
}
