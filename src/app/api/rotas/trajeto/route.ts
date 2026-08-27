import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { calcularTrajeto, DEPOSITO, type Ponto } from "@/lib/rota-trajeto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Traçado e quilometragem das entregas selecionadas no planejador.
 *
 * Fica no servidor e não no browser para o roteador público ver um
 * User-Agent só e não um por usuário, e para o timeout e o cálculo
 * aproximado morarem em um lugar só.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const paradas: Ponto[] = Array.isArray(body.paradas) ? body.paradas : [];
  const retornarDeposito = body.retornarDeposito !== false;

  const validas = paradas.filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  );

  if (validas.length === 0) {
    return NextResponse.json({
      distanciaKm: 0, duracaoHoras: 0, linha: [], aproximado: false, paradas: 0,
    });
  }

  // A rota começa carregando no depósito; o retorno é opcional porque nem
  // toda viagem volta vazia para Aparecida no mesmo dia.
  const pontos: Ponto[] = [DEPOSITO, ...validas];
  if (retornarDeposito) pontos.push(DEPOSITO);

  const trajeto = await calcularTrajeto(pontos);

  return NextResponse.json({ ...trajeto, paradas: validas.length });
}
