import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { buscarProdutos } from "@/lib/produto-catalogo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const limite = Math.min(parseInt(searchParams.get("limite") || "30"), 100);
  const resultados = await buscarProdutos(q, limite);
  return NextResponse.json({ query: q, total: resultados.length, resultados });
}
