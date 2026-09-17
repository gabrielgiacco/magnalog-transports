import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { buscarProdutos } from "@/lib/produto-catalogo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const limite = Math.min(parseInt(searchParams.get("limite") || "30"), 100);
  const resultados = await buscarProdutos(q, limite);
  return NextResponse.json({ query: q, total: resultados.length, resultados });
}
