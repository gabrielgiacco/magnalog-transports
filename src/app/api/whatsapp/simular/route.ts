import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { atender } from "@/lib/whatsapp/atendimento";
import type { MensagemEntrada } from "@/lib/whatsapp/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simulador do atendimento: roda identidade, roteador e autorização inteiros,
 * e NÃO envia nada.
 *
 * Fora do ar em produção. Ele responde "o que aconteceria com o telefone X",
 * e em produção isso é uma forma de descobrir quais notas pertencem a quem,
 * sem nem precisar do WhatsApp. Vale como ferramenta de desenvolvimento e só.
 *
 * Também nunca grava em MensagemWhats: aquela tabela É o contador da cota, e
 * uma linha falsa de ENVIADA corromperia o número que trava os envios reais.
 */
/** Monta a mensagem neutra a partir do corpo enviado pelo painel. */
function mensagemSimulada(body: Record<string, unknown>): MensagemEntrada {
  const temLocal = body.latitude != null && body.longitude != null;
  return {
    providerId: "simulado-" + Date.now(),
    telefone: String(body.telefone || ""),
    nomePerfil: typeof body.nomePerfil === "string" ? body.nomePerfil : null,
    tipo: temLocal ? "LOCALIZACAO" : "TEXTO",
    texto: typeof body.texto === "string" ? body.texto : null,
    latitude: temLocal ? Number(body.latitude) : null,
    longitude: temLocal ? Number(body.longitude) : null,
    aoVivo: Boolean(body.aoVivo),
    recebidaEm: new Date(),
  };
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas ADMIN" }, { status: 403 });
  }

  const r = await atender(mensagemSimulada(await req.json()), new URL(req.url).origin);

  return NextResponse.json({
    identidade: r.identidade,
    intencao: r.intencao,
    entregaId: r.entregaId ?? null,
    responderia: r.resposta !== null,
    motivoSemResposta: r.motivoSemResposta ?? null,
    resposta: r.resposta,
  });
}
