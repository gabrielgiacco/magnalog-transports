import { NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { backfillTelefones } from "@/lib/whatsapp/backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preenche telefoneNorm / whatsappNorm nos cadastros anteriores às colunas.
 *
 * É rota e não script solto de propósito: vai junto no deploy e roda em
 * produção sem ninguém precisar do banco na mão. Enquanto não rodar, o
 * atendimento por WhatsApp não reconhece nenhum cadastro antigo.
 */
export async function POST() {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas ADMIN" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, ...(await backfillTelefones()) });
}
