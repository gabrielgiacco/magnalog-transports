import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { montarDefaultsTicket } from "@/lib/ticket-data";

export const dynamic = "force-dynamic";

// Devolve SÓ os valores já calculados para o modal preencher. A TabelaTicket em
// si continua sendo leitura exclusiva de ADMIN (/api/tickets/tabelas).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;

  const role = (session.user as any)?.role;
  if (!["ADMIN", "FINANCEIRO", "OPERACIONAL"].includes(role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const embarcador = searchParams.get("embarcador");

  const defaults = await montarDefaultsTicket(params.id, embarcador);
  if (!defaults) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  return NextResponse.json(defaults);
}
