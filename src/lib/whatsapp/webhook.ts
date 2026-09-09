// Recebimento de WhatsApp.
//
// Etapa 1: o payload passa a ser interpretado pelo adaptador do provedor, mas
// o atendimento ainda NÃO responde nada — não existe nenhuma chamada de envio
// neste arquivo, então o endpoint continua incapaz de gastar cota.
//
// O `bruto` segue sendo guardado inteiro. Ele é o que permitiu escrever o
// parser contra dado real em vez de documentação, e é a rede para quando algo
// chegar diferente do esperado.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getProvedor } from "@/lib/whatsapp";
import type { MensagemEntrada } from "@/lib/whatsapp/provider";

/** Acima disto não é webhook de mensagem, é abuso. */
const MAX_CORPO_BYTES = 256 * 1024;

/** Nunca guardar credencial junto do payload. */
const HEADERS_OMITIDOS = new Set(["cookie", "authorization", "apikey", "x-api-key"]);

export interface ResultadoWebhook {
  status: number;
  corpo: { ok: boolean; motivo?: string; gravadas?: number };
}

/** Headers guardados junto do payload, para diagnóstico. */
function headersParaRegistro(headers: Headers): Record<string, string> {
  const saida: Record<string, string> = {};
  headers.forEach((valor, nome) => {
    if (!HEADERS_OMITIDOS.has(nome.toLowerCase())) saida[nome] = valor;
  });
  return saida;
}

/** Corpo que não é JSON também é informação: vira null e segue para o registro. */
function comoJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** O erro do Prisma não é tipado no catch; só precisamos do código. */
function codigoPrisma(erro: unknown): string | null {
  if (typeof erro !== "object" || erro === null) return null;
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === "string" ? codigo : null;
}

/**
 * Chave de deduplicação para o que o parser descartou (mensagem nossa, de
 * grupo, evento de outro tipo). O hash do corpo cobre o caso que importa: a
 * retentativa do provedor manda o MESMO corpo e gera a mesma chave.
 */
function idDoDescarte(raw: string): string {
  return "sha:" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Evento que o parser não reconheceu — mensagem nossa, de grupo, de outro tipo.
 * É guardado mesmo assim, para nenhum evento ficar invisível: sem isto, "o
 * cliente mandou e não aconteceu nada" não teria como ser investigado.
 */
function entradaDeDescarte(raw: string): MensagemEntrada {
  return {
    providerId: idDoDescarte(raw),
    telefone: "",
    nomePerfil: null,
    tipo: "OUTRO",
    texto: null,
    latitude: null,
    longitude: null,
    aoVivo: false,
    recebidaEm: new Date(),
  };
}

/** Uma linha por mensagem. P2002 é a deduplicação funcionando, não erro. */
async function gravar(msg: MensagemEntrada, bruto: string, provedor: string): Promise<boolean> {
  try {
    await prisma.mensagemWhatsRecebida.create({
      data: {
        provedor,
        providerId: msg.providerId,
        telefone: msg.telefone,
        nomePerfil: msg.nomePerfil,
        tipo: msg.tipo,
        texto: msg.texto,
        latitude: msg.latitude,
        longitude: msg.longitude,
        bruto,
        recebidaEm: msg.recebidaEm,
      },
    });
    return true;
  } catch (erro) {
    if (codigoPrisma(erro) === "P2002") return false;
    throw erro;
  }
}

/**
 * Processa um POST do webhook.
 *
 * Contrato: SEMPRE devolve 200, exceto assinatura inválida (401). Erro nosso
 * não pode virar 5xx — o provedor retentaria três vezes um bug, e o efeito
 * colateral rodaria de novo.
 */
export async function receberWebhook(raw: string, headers: Headers): Promise<ResultadoWebhook> {
  if (raw.length > MAX_CORPO_BYTES) {
    return { status: 200, corpo: { ok: false, motivo: "corpo grande demais" } };
  }

  const provedor = getProvedor();
  const assinatura = provedor.verificarAssinatura(raw, headers);

  if (!assinatura.ok) {
    console.warn(`[whatsapp] webhook rejeitado: ${assinatura.motivo}`);
    return { status: 401, corpo: { ok: false, motivo: assinatura.motivo } };
  }
  if (!assinatura.conferida) {
    console.warn(
      "[whatsapp] webhook aceito SEM conferir assinatura — PINGO_WEBHOOK_SECRET não configurado"
    );
  }

  const payload = comoJson(raw);
  const bruto = JSON.stringify({
    recebidoEm: new Date().toISOString(),
    assinaturaConferida: assinatura.conferida,
    convencaoAssinatura: assinatura.convencao ?? null,
    headers: headersParaRegistro(headers),
    corpo: payload ?? raw,
  });

  try {
    const reconhecidas = provedor.parseEntrada(payload);
    const mensagens = reconhecidas.length > 0 ? reconhecidas : [entradaDeDescarte(raw)];

    let gravadas = 0;
    for (const msg of mensagens) {
      if (await gravar(msg, bruto, provedor.nome)) gravadas++;
    }

    // Etapa 2 em diante, é daqui que sai a resposta. Hoje termina aqui.
    return { status: 200, corpo: { ok: true, gravadas } };
  } catch (erro) {
    console.error("[whatsapp] falha ao processar mensagem recebida:", erro);
    return { status: 200, corpo: { ok: false, motivo: "falha ao gravar" } };
  }
}
