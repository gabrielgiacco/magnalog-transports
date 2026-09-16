import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validarToken, type EntregaDoToken } from "@/lib/upload-token";
import { logFromRequest } from "@/lib/audit";
import { lerPosicao, lerGps, type Posicao } from "@/lib/posicao-motorista";
import { MOTIVOS_MOTORISTA, PREFIXO_MOTORISTA } from "@/lib/ocorrencia-motorista";

export const dynamic = "force-dynamic";

const MAX_TEXTO = 500;
const MAX_OCORRENCIAS = 5;
const STATUS_PERMITIDOS = new Set(["CARREGADO", "EM_ROTA"]);

const erro = (status: number, error: string, message?: string) =>
  NextResponse.json({ error, message }, { status });

/** Valida o body e devolve os campos prontos, ou a resposta de erro. */
function lerMotivo(body: Record<string, unknown>): { motivo: string; texto: string } | NextResponse {
  const motivo = String(body.motivo ?? "");
  if (!MOTIVOS_MOTORISTA[motivo]) return erro(400, "MOTIVO_INVALIDO");
  const texto = String(body.texto ?? "").trim();
  if (motivo === "OUTROS" && !texto) return erro(400, "TEXTO_OBRIGATORIO", "Descreva o que aconteceu.");
  if (texto.length > MAX_TEXTO) return erro(400, "TEXTO_LONGO", `No máximo ${MAX_TEXTO} caracteres.`);
  return { motivo, texto };
}

type Registro = { entrega: EntregaDoToken; motivo: string; texto: string; gps: string; posicao: Posicao | null };

async function registrar(req: NextRequest, { entrega, motivo, texto, gps, posicao }: Registro) {
  const descricao = `${PREFIXO_MOTORISTA} ${MOTIVOS_MOTORISTA[motivo]}${texto ? `: ${texto}` : ""}`;
  const oc = await prisma.ocorrencia.create({ data: { entregaId: entrega.id, tipo: motivo, descricao } });

  let posicaoId: string | null = null;
  if (posicao) {
    const p = await prisma.posicaoEntrega.create({
      data: { entregaId: entrega.id, motoristaId: entrega.motorista?.id ?? null, ...posicao, origem: "OCORRENCIA_MOTORISTA" },
    });
    posicaoId = p.id;
  }

  await logFromRequest(req, "OCORRENCIA_CRIADA", {
    user: { name: entrega.motorista?.nome ?? "Motorista (link)", role: "MOTORISTA_LINK" },
    recursoTipo: "ocorrencia",
    recursoId: oc.id,
    recursoDesc: `${motivo} · entrega ${entrega.codigo}`,
    detalhes: { origem: "link_motorista", entregaId: entrega.id, tipo: motivo, descricao, gps, posicaoId },
  });
  return oc;
}

/**
 * POST — o motorista registra uma ocorrência SEM mudar o status da entrega.
 *
 * Ela continua EM_ROTA: o motorista pula para a próxima parada e volta depois.
 * Quem decide se a entrega vira OCORRENCIA de verdade é a equipe, pelo fluxo
 * que já existe. A equipe vê o registro no card de Ocorrências da entrega e
 * em Avarias → Ocorrências, sem nenhuma mudança de tela.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const entrega = await validarToken(params.token);
  if (!entrega) return erro(404, "Link inválido ou expirado");

  if (!STATUS_PERMITIDOS.has(entrega.status)) {
    return erro(409, "STATUS_INCOMPATIVEL", "Esta entrega não está em rota — fale com a Magna Log.");
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const lido = lerMotivo(body);
  if (lido instanceof NextResponse) return lido;

  // Teto por entrega: o token é público e não pode virar gerador de lixo.
  const existentes = await prisma.ocorrencia.count({
    where: { entregaId: entrega.id, descricao: { startsWith: PREFIXO_MOTORISTA } },
  });
  if (existentes >= MAX_OCORRENCIAS) {
    return erro(429, "LIMITE_OCORRENCIAS", "Limite de ocorrências desta entrega. Fale com a Magna Log.");
  }

  const oc = await registrar(req, { entrega, ...lido, gps: lerGps(body.gps), posicao: lerPosicao(body.posicao) });
  return NextResponse.json({ id: oc.id, tipo: oc.tipo, descricao: oc.descricao, createdAt: oc.createdAt }, { status: 201 });
}
