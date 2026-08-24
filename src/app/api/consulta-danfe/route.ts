import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { buscarXmlPorChave, chaveValida, MeuDanfeError } from "@/lib/meudanfe";

export const dynamic = "force-dynamic";

/**
 * Busca a NF-e na Receita pela chave e devolve o XML.
 * ATENCAO: esta e a unica chamada COBRADA do Meu Danfe (R$ 0,03 por consulta).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const { chave } = await req.json();

    if (!chave || !chaveValida(String(chave))) {
      return NextResponse.json(
        { error: "Chave de acesso invalida. Deve conter 44 caracteres." },
        { status: 400 }
      );
    }

    const xml = await buscarXmlPorChave(String(chave));
    return NextResponse.json({ xml });
  } catch (e: any) {
    if (e instanceof MeuDanfeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("Erro consulta DANFE:", e);
    return NextResponse.json({ error: "Erro interno ao consultar NF-e." }, { status: 500 });
  }
}
