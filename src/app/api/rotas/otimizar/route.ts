import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { otimizarOrdem, MAX_PARADAS_OTIMIZAR, type Ponto } from "@/lib/rota-trajeto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Ordem mais curta para as paradas selecionadas no planejador.
 *
 * Rota irmã de /trajeto, e não uma flag nela: a resposta tem outro formato e
 * existe um modo de falha (502, roteador fora) que o trajeto nunca tem —
 * ele sempre degrada para linha reta, aqui a degradação é "mantém a ordem".
 */
export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const paradas: Ponto[] = Array.isArray(body.paradas) ? body.paradas : [];
  const retornarDeposito = body.retornarDeposito !== false;

  const validas = paradas.filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  );

  if (validas.length < 2) {
    return NextResponse.json({ error: "Selecione pelo menos 2 paradas com coordenada" }, { status: 400 });
  }
  if (validas.length > MAX_PARADAS_OTIMIZAR) {
    return NextResponse.json(
      { error: `O roteador aceita até ${MAX_PARADAS_OTIMIZAR} paradas por rota. Divida a seleção.` },
      { status: 400 },
    );
  }

  const resultado = await otimizarOrdem(validas, retornarDeposito);
  if (!resultado) {
    return NextResponse.json({ error: "Roteador indisponível — ordem mantida" }, { status: 502 });
  }

  // Os índices de `ordem` referem-se ao array `validas`, que preserva a ordem
  // do que o cliente enviou depois de descartar entradas sem coordenada.
  return NextResponse.json(resultado);
}
