import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { resolverContatosEntrega } from "@/lib/embarcador-contato";

export const dynamic = "force-dynamic";

// Lista os embarcadores da entrega com o WhatsApp de cada um. Consulta enxuta
// de propósito: o ticket-preview calcula diária, armazenagem e alíquotas, que
// não têm nada a ver com mandar um aviso.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const contatos = await resolverContatosEntrega(params.id);
  if (!contatos) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  return NextResponse.json(contatos);
}
