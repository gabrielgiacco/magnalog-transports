import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validarTokenRota, type RotaDoToken, type ParadaDoToken } from "@/lib/upload-token";
import { logFromRequest } from "@/lib/audit";
import { lerPosicao, lerGps, type Posicao } from "@/lib/posicao-motorista";

export const dynamic = "force-dynamic";

/**
 * Avança uma parada CARREGADO → EM_ROTA por compare-and-swap. O where inclui
 * rotaId e o status esperado: só mexe no que é desta rota e ainda está
 * carregado. Devolve true se avançou.
 */
async function avancarParada(rotaId: string, p: ParadaDoToken): Promise<boolean> {
  const r = await prisma.entrega.updateMany({
    where: { id: p.id, rotaId, status: "CARREGADO" },
    data: { status: "EM_ROTA" },
  });
  return r.count === 1;
}

type Registro = { req: NextRequest; rota: RotaDoToken; gps: string; posicao: Posicao | null };

/** Posição + auditoria por entrega avançada. Mesmo evento do link por entrega. */
async function registrar({ req, rota, gps, posicao }: Registro, avancadas: ParadaDoToken[]) {
  if (posicao) {
    await prisma.posicaoEntrega.createMany({
      data: avancadas.map((p) => ({
        entregaId: p.id, motoristaId: rota.motorista?.id ?? null, ...posicao, origem: "STATUS_EM_ROTA",
      })),
    });
  }
  for (const p of avancadas) {
    await logFromRequest(req, "ENTREGA_STATUS_MOTORISTA", {
      user: { name: rota.motorista?.nome ?? "Motorista (link)", role: "MOTORISTA_LINK" },
      recursoTipo: "entrega",
      recursoId: p.id,
      recursoDesc: `${p.codigo} · ${p.razaoSocial}`,
      detalhes: { origem: "link_rota", rotaId: rota.id, rotaCodigo: rota.codigo, de: "CARREGADO", para: "EM_ROTA", gps, posicaoRegistrada: !!posicao },
    });
  }
}

/**
 * POST — "Iniciar rota": todas as paradas CARREGADO viram EM_ROTA e a rota
 * PLANEJADA vira EM_ANDAMENTO. Nenhum id vem do body; tudo é resolvido pelo
 * token. Replay sem nada para avançar é zero escrita.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const rota = await validarTokenRota(params.token);
  if (!rota) return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  if (rota.status === "CONCLUIDA") return NextResponse.json({ error: "ROTA_ENCERRADA" }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const carregadas = rota.entregas.filter((p) => p.status === "CARREGADO");
  const puladas = rota.entregas.length - carregadas.length;

  const avancadas: ParadaDoToken[] = [];
  for (const p of carregadas) {
    if (await avancarParada(rota.id, p)) avancadas.push(p);
  }

  // Rota só muda se estava PLANEJADA; EM_ANDAMENTO fica como está.
  const rotaCas = await prisma.rota.updateMany({
    where: { id: rota.id, status: "PLANEJADA" },
    data: { status: "EM_ANDAMENTO" },
  });
  const rotaStatus = rotaCas.count === 1 ? "EM_ANDAMENTO" : rota.status;

  if (avancadas.length > 0) {
    await registrar({ req, rota, gps: lerGps(body.gps), posicao: lerPosicao(body.posicao) }, avancadas);
  }

  return NextResponse.json({
    ok: true,
    avancou: avancadas.length > 0,
    avancadas: avancadas.length,
    puladas,
    rotaStatus,
  });
}
