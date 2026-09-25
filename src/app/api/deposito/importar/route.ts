import { NextRequest, NextResponse } from "next/server";
import { Prisma, OrigemDepositoItem, TipoEntradaDeposito } from "@prisma/client";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";
import { proximoCodigoDeposito } from "@/lib/deposito";
import { buscarCandidatosPorId, type CandidatoDeposito, type OrigemCandidato } from "@/lib/deposito-candidatos";

export const dynamic = "force-dynamic";

const ORIGENS_VALIDAS = new Set<OrigemCandidato>(["NOTA_DEVOLUCAO", "AVARIA", "ENTREGA"]);
const TIPOS_VALIDOS = new Set<TipoEntradaDeposito>(["DEVOLUCAO_TOTAL", "DEVOLUCAO_PARCIAL", "SOBRA", "AVARIA", "ARMAZENAGEM"]);

// Sentinela pra diferenciar "já importado" (esperado, vai pra ignorados) de
// qualquer outro erro inesperado dentro da transação por item.
const DUPLICADO = Symbol("duplicado");

interface ItemBody {
  origem?: string;
  refId?: string;
  tipoEntrada?: string;
  volumes?: number;
  pesoKg?: number;
  valorMercadoria?: number;
  localizacao?: string;
  embarcadorCnpj?: string;
  embarcadorRazao?: string;
  descricao?: string;
  dataEntrada?: string;
}

interface Ignorado {
  refId: string;
  motivo: string;
}

function numOuPadrao(v: unknown, padrao: number): number {
  if (v === undefined || v === null || v === ("" as unknown)) return padrao;
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
}

/** Confere se já existe item de depósito pra esta origem — mesma dedup do
 * GET /candidatos, mas dentro da transação, pra não perder a corrida entre
 * o GET e este POST. */
async function jaImportado(tx: Prisma.TransactionClient, origem: OrigemCandidato, refId: string): Promise<boolean> {
  if (origem === "NOTA_DEVOLUCAO") {
    return !!(await tx.depositoItem.findUnique({ where: { notaDevolucaoId: refId }, select: { id: true } }));
  }
  if (origem === "AVARIA") {
    return !!(await tx.depositoItem.findFirst({ where: { avariaId: refId }, select: { id: true } }));
  }
  return !!(await tx.depositoItem.findFirst({ where: { notaFiscalId: refId }, select: { id: true } }));
}

/** Embarcador final: override do body (a correção que o conferente digitou
 * na tela, pro caso embarcadorIncerto) senão o resolvido no snapshot. */
function embarcadorFinal(it: ItemBody, cand: CandidatoDeposito): { cnpj: string; razao: string } {
  return {
    cnpj: it.embarcadorCnpj?.trim() || cand.embarcadorCnpj,
    razao: it.embarcadorRazao?.trim() || cand.embarcadorRazao,
  };
}

/** Monta os dados de criação: identidade (embarcador resolvido, notaNumero,
 * descrição-base, ligação com NF/avaria/NFD) vem do snapshot reconstruído no
 * servidor; volumes/peso/valor/localização/data são os números que o
 * conferente ajustou e o body manda explicitamente. */
function montarDados(it: ItemBody, cand: CandidatoDeposito, origem: OrigemCandidato, embarcador: { cnpj: string; razao: string }) {
  const tipoEntrada =
    it.tipoEntrada && TIPOS_VALIDOS.has(it.tipoEntrada as TipoEntradaDeposito)
      ? (it.tipoEntrada as TipoEntradaDeposito)
      : cand.tipoEntradaSugerido;

  return {
    tipoEntrada,
    embarcadorCnpj: embarcador.cnpj,
    embarcadorRazao: embarcador.razao,
    notaNumero: cand.notaNumero,
    notaSerie: cand.notaSerie,
    notaChave: cand.notaChave,
    descricao: it.descricao?.trim() || cand.descricao,
    volumes: Number(it.volumes),
    pesoKg: numOuPadrao(it.pesoKg, cand.pesoKg),
    valorMercadoria: numOuPadrao(it.valorMercadoria, cand.valorMercadoria),
    localizacao: it.localizacao?.trim() || null,
    dataEntrada: it.dataEntrada ? new Date(it.dataEntrada.slice(0, 10) + "T00:00:00.000Z") : cand.dataSugerida,
    origem: origem as unknown as OrigemDepositoItem,
    avariaId: cand.avariaId,
    notaDevolucaoId: origem === "NOTA_DEVOLUCAO" ? cand.refId : null,
    entregaId: cand.entregaId,
    notaFiscalId: cand.notaFiscalId,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const itensBody: ItemBody[] = Array.isArray(body?.itens) ? body.itens : [];
  if (itensBody.length === 0) {
    return NextResponse.json({ error: "Envie ao menos um item" }, { status: 400 });
  }

  const ignorados: Ignorado[] = [];

  // Volumes < 1 fica de fora antes de qualquer consulta: item sem volume
  // inutiliza o relatório semanal.
  const itens = itensBody.filter((it) => {
    if (!it.refId || !it.origem || !ORIGENS_VALIDAS.has(it.origem as OrigemCandidato)) {
      ignorados.push({ refId: it.refId || "?", motivo: "origem ou id inválido" });
      return false;
    }
    const volumes = Number(it.volumes);
    if (!Number.isInteger(volumes) || volumes < 1) {
      ignorados.push({ refId: it.refId, motivo: "volumes deve ser um inteiro de ao menos 1" });
      return false;
    }
    return true;
  });

  // Reconstrói o snapshot a partir só do refId — o cliente manda id mais os
  // números que o conferente ajustou, nunca os dados de identidade.
  const candidatos = await buscarCandidatosPorId(prisma, {
    notaDevolucaoIds: itens.filter((i) => i.origem === "NOTA_DEVOLUCAO").map((i) => i.refId!),
    avariaIds: itens.filter((i) => i.origem === "AVARIA").map((i) => i.refId!),
    notaFiscalIds: itens.filter((i) => i.origem === "ENTREGA").map((i) => i.refId!),
  });
  const candidatoPorChave = new Map(candidatos.map((c) => [`${c.origem}:${c.refId}`, c]));

  const criados: Awaited<ReturnType<typeof prisma.depositoItem.create>>[] = [];

  // Uma transação por item, não uma pro lote inteiro: assim um item com
  // problema nunca derruba os outros já importados.
  for (const it of itens) {
    const origem = it.origem as OrigemCandidato;
    const cand = candidatoPorChave.get(`${origem}:${it.refId}`);
    if (!cand) {
      ignorados.push({ refId: it.refId!, motivo: "registro não encontrado" });
      continue;
    }

    // O relatório semanal inteiro agrupa por embarcador — item sem um é lixo
    // silencioso nele. Se o candidato veio embarcadorIncerto e o body não
    // corrigiu, rejeita antes de qualquer escrita.
    const embarcador = embarcadorFinal(it, cand);
    if (!embarcador.cnpj) {
      ignorados.push({ refId: it.refId!, motivo: "Embarcador não identificado — informe antes de importar" });
      continue;
    }

    try {
      const criado = await prisma.$transaction(async (tx) => {
        if (await jaImportado(tx, origem, it.refId!)) throw DUPLICADO;

        const item = await tx.depositoItem.create({
          data: {
            ...montarDados(it, cand, origem, embarcador),
            codigo: await proximoCodigoDeposito(tx),
            registradoPorId: auth.user.id,
          },
        });

        await tx.depositoMovimento.create({
          data: { itemId: item.id, tipo: "ENTRADA", volumes: item.volumes, usuarioId: auth.user.id },
        });

        return item;
      });
      criados.push(criado);
    } catch (e) {
      ignorados.push({ refId: it.refId!, motivo: e === DUPLICADO ? "já importado para o depósito" : "erro ao importar" });
    }
  }

  await logFromRequest(req, "OUTRO", {
    user: { id: auth.user.id, email: auth.user.email, name: auth.user.nome, role: auth.user.role },
    recursoTipo: "deposito",
    detalhes: { acao: "importacao", criados: criados.length, ignorados: ignorados.length },
  });

  return NextResponse.json({ criados: criados.length, itens: criados, ignorados });
}
