import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validarToken, type EntregaDoToken } from "@/lib/upload-token";
import { logFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Toda a autorização do link está nesta tabela: o motorista só sai do estado
 * da esquerda para o da direita. Não existe EM_SEPARACAO (é trabalho do
 * depósito), não existe FINALIZADO (é fechamento financeiro, fica com a
 * equipe), não existe retrocesso e nada toca OCORRENCIA.
 */
const ANTERIOR = { EM_ROTA: "CARREGADO", ENTREGUE: "EM_ROTA" } as const;
type Para = keyof typeof ANTERIOR;
type De = (typeof ANTERIOR)[Para];

const GPS_VALIDOS = new Set(["ok", "negado", "indisponivel", "timeout"]);

type Posicao = { latitude: number; longitude: number; precisaoM: number | null };

// Mesma regra do PATCH de posição: zero é o Golfo da Guiné, não uma entrega.
function coordenadaValida(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 || lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function lerPosicao(bruta: unknown): Posicao | null {
  const p = (bruta ?? {}) as Record<string, unknown>;
  const latitude = Number(p.latitude);
  const longitude = Number(p.longitude);
  if (!coordenadaValida(latitude, longitude)) return null;
  const precisao = Number(p.precisaoM);
  return { latitude, longitude, precisaoM: Number.isFinite(precisao) && precisao > 0 ? precisao : null };
}

const erro = (status: number, error: string, message?: string, extra?: object) =>
  NextResponse.json({ error, message, ...extra }, { status });

/**
 * ENTREGUE exige canhoto, assinatura e nenhuma nota cancelada. Contagens, não
 * ids vindos do body: um retry depois de POST falho funciona sem assinar de
 * novo, e o cliente não consegue apontar anexo de outra entrega.
 */
async function bloqueioParaEntregue(entregaId: string): Promise<NextResponse | null> {
  const [canhotos, assinaturas, canceladas] = await Promise.all([
    prisma.anexoEntrega.count({ where: { entregaId, tipo: { in: ["CANHOTO", "CANHOTO_DESCARGA"] } } }),
    prisma.anexoEntrega.count({ where: { entregaId, tipo: "ASSINATURA" } }),
    prisma.notaFiscal.count({ where: { entregaId, cancelada: true } }),
  ]);
  if (canceladas > 0) return erro(400, "NOTA_CANCELADA", "Nota cancelada — fale com a Magna Log antes de entregar.");
  if (canhotos === 0) return erro(400, "CANHOTO_OBRIGATORIO", "Tire a foto do canhoto antes de confirmar a entrega.");
  if (assinaturas === 0) return erro(400, "ASSINATURA_OBRIGATORIA", "Colha a assinatura de quem recebeu antes de confirmar.");
  return null;
}

/**
 * Compare-and-swap: só avança se o banco ainda estiver no estado que lemos.
 * Dois toques simultâneos produzem exatamente um avanço. Devolve null quando
 * outro toque chegou antes.
 */
async function avancar(entrega: EntregaDoToken, de: De, para: Para) {
  const cas = await prisma.entrega.updateMany({
    where: { id: entrega.id, status: de },
    data: {
      status: para,
      // A equipe pede a data à mão; o motorista só tem o agora, que é a verdade.
      ...(para === "ENTREGUE" && !entrega.dataEntrega ? { dataEntrega: new Date() } : {}),
    },
  });
  return cas.count === 1;
}

type Registro = { entrega: EntregaDoToken; de: De; para: Para; gps: string; posicao: Posicao | null };

async function registrar(req: NextRequest, { entrega, de, para, gps, posicao }: Registro) {
  let posicaoId: string | null = null;
  if (posicao) {
    const p = await prisma.posicaoEntrega.create({
      data: { entregaId: entrega.id, motoristaId: entrega.motorista?.id ?? null, ...posicao, origem: `STATUS_${para}` },
    });
    posicaoId = p.id;
  }
  await logFromRequest(req, "ENTREGA_STATUS_MOTORISTA", {
    // userId fica nulo de propósito: não há usuário logado. O papel marca a origem.
    user: { name: entrega.motorista?.nome ?? "Motorista (link)", role: "MOTORISTA_LINK" },
    recursoTipo: "entrega",
    recursoId: entrega.id,
    recursoDesc: `${entrega.codigo} · ${entrega.razaoSocial}`,
    detalhes: { origem: "link_motorista", de, para, gps, posicaoId },
  });
  return !!posicaoId;
}

/**
 * POST — o motorista avança o status da entrega pelo link.
 *
 * O cliente NUNCA manda o estado de origem: o servidor relê o status atual e
 * só aceita a transição adjacente. Só sucesso é auditado — falha e replay são
 * uma leitura indexada e zero escrita, mesmo perfil de custo do GET público,
 * para o token não virar vetor de amplificação de escrita.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const entrega = await validarToken(params.token);
  if (!entrega) return erro(404, "Link inválido ou expirado");

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const para = body.para as Para;
  const de = ANTERIOR[para];
  if (!de) return erro(400, "TRANSICAO_INVALIDA");

  // Replay idempotente: já está onde queria ir. Nada a fazer, nada a gravar.
  if (entrega.status === para) return NextResponse.json({ ok: true, status: para, avancou: false });

  if (entrega.status !== de) {
    return erro(409, "STATUS_INCOMPATIVEL", `A entrega está em ${entrega.status}; o link só avança de ${de} para ${para}.`, { status: entrega.status });
  }

  if (para === "ENTREGUE") {
    const bloqueio = await bloqueioParaEntregue(entrega.id);
    if (bloqueio) return bloqueio;
  }

  if (!(await avancar(entrega, de, para))) {
    // Outro toque chegou antes. Se já está em `para`, é o mesmo avanço — 200.
    const atual = await prisma.entrega.findUnique({ where: { id: entrega.id }, select: { status: true } });
    if (atual?.status === para) return NextResponse.json({ ok: true, status: para, avancou: false });
    return erro(409, "STATUS_INCOMPATIVEL", undefined, { status: atual?.status });
  }

  const gps = GPS_VALIDOS.has(String(body.gps)) ? String(body.gps) : "indisponivel";
  const posicaoRegistrada = await registrar(req, { entrega, de, para, gps, posicao: lerPosicao(body.posicao) });

  return NextResponse.json({ ok: true, status: para, avancou: true, posicaoRegistrada });
}
