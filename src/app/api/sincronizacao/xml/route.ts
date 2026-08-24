import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { baixarXml, chaveValida, MeuDanfeError } from "@/lib/meudanfe";

export const dynamic = "force-dynamic";

/**
 * Baixa o XML de um documento que ja esta na Area do Cliente. GRATIS.
 * Nao usa /fd/add — este endpoint jamais dispara busca cobrada na Receita.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const chave = String(body.chave || "").trim();

  if (!chaveValida(chave)) {
    return NextResponse.json({ error: "Chave de acesso invalida." }, { status: 400 });
  }

  try {
    const xml = await baixarXml(chave);
    return NextResponse.json({ chave, xml });
  } catch (e: any) {
    if (e instanceof MeuDanfeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[sincronizacao/xml] erro:", e);
    return NextResponse.json({ error: "Erro ao baixar o XML." }, { status: 500 });
  }
}
