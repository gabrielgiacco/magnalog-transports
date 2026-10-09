import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { lerFiltrosChecklist, opcoesDoDia } from "@/lib/checklist-carregamento";

export const dynamic = "force-dynamic";

// Opcoes dos filtros do checklist de carregamento: o que existe nas cargas da data.
export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const { data } = lerFiltrosChecklist(new URL(req.url).searchParams);
  return NextResponse.json(await opcoesDoDia(data));
}
