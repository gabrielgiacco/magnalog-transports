// Recebimento de WhatsApp: recebe, registra e responde.
//
// A ordem importa e é deliberada — grava, depois atende. Ver o comentário no
// laço: é o que impede resposta em dobro quando o provedor retenta.
//
// Nada dispara enquanto WhatsAppConfig.atendimentoAtivo estiver false, que é
// como ele nasce. Nesse estado o sistema recebe e registra tudo sem gastar
// uma mensagem — o modo de observar a operação real antes de soltar o robô.
//
// O `bruto` segue sendo guardado inteiro. Ele é o que permitiu escrever o
// parser contra dado real em vez de documentação, e é a rede para quando algo
// chegar diferente do esperado.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getProvedor } from "@/lib/whatsapp";
import type {
  MensagemEntrada,
  ProvedorWhats,
  ResultadoAssinatura,
} from "@/lib/whatsapp/provider";
import { atender } from "@/lib/whatsapp/atendimento";
import { responder } from "@/lib/whatsapp/responder";

/** Acima disto não é webhook de mensagem, é abuso. */
const MAX_CORPO_BYTES = 256 * 1024;

/** Nunca guardar credencial junto do payload. */
const HEADERS_OMITIDOS = new Set(["cookie", "authorization", "apikey", "x-api-key"]);

export interface ResultadoWebhook {
  status: number;
  corpo: { ok: boolean; motivo?: string; gravadas?: number; respondidas?: number };
}

/** Headers guardados junto do payload, para diagnóstico. */
function headersParaRegistro(headers: Headers): Record<string, string> {
  const saida: Record<string, string> = {};
  headers.forEach((valor, nome) => {
    if (!HEADERS_OMITIDOS.has(nome.toLowerCase())) saida[nome] = valor;
  });
  return saida;
}

/**
 * URL pública deste deploy, para montar o link da página de rastreio.
 * Vem dos headers do proxy: a Vercel não expõe isso em variável de ambiente
 * confiável entre preview e produção.
 */
function baseUrl(headers: Headers): string {
  const host = headers.get("x-forwarded-host") || headers.get("host") || "";
  const proto = headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "https://tms-magnalog.vercel.app";
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

/**
 * Uma linha por mensagem. Devolve o id, ou null quando já existia — P2002 é a
 * deduplicação funcionando, não erro.
 */
async function gravar(msg: MensagemEntrada, bruto: string, provedor: string): Promise<string | null> {
  try {
    const linha = await prisma.mensagemWhatsRecebida.create({
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
    return linha.id;
  } catch (erro) {
    if (codigoPrisma(erro) === "P2002") return null;
    throw erro;
  }
}

/**
 * Porta de entrada: ou recusa a requisição, ou libera com o veredito da
 * assinatura. Separado do fluxo para o handler não misturar controle de acesso
 * com processamento.
 */
function portao(
  provedor: ProvedorWhats,
  raw: string,
  headers: Headers
): { recusa: ResultadoWebhook } | { assinatura: ResultadoAssinatura } {
  const assinatura = provedor.verificarAssinatura(raw, headers);

  if (!assinatura.ok) {
    console.warn(`[whatsapp] webhook rejeitado: ${assinatura.motivo}`);
    return { recusa: { status: 401, corpo: { ok: false, motivo: assinatura.motivo } } };
  }
  if (!assinatura.conferida) {
    console.warn(
      "[whatsapp] webhook aceito SEM conferir assinatura — PINGO_WEBHOOK_SECRET não configurado"
    );
  }

  return { assinatura };
}

/**
 * O que fica guardado no campo `bruto`: payload intacto, headers recebidos e
 * o veredito da assinatura. Foi ele que permitiu escrever o parser contra dado
 * real, e é onde se olha quando algo chega diferente do esperado.
 */
function envelope(
  raw: string,
  payload: unknown,
  assinatura: ResultadoAssinatura,
  headers: Headers
): string {
  return JSON.stringify({
    recebidoEm: new Date().toISOString(),
    assinaturaConferida: assinatura.conferida,
    convencaoAssinatura: assinatura.convencao ?? null,
    headers: headersParaRegistro(headers),
    corpo: payload ?? raw,
  });
}

/**
 * Registra uma mensagem e responde, se for o caso.
 *
 * GRAVAR ANTES DE PROCESSAR é a rede contra resposta dobrada: se o orçamento
 * de tempo estourar e o provedor retentar, a segunda entrega bate no unique e
 * vira no-op. O preço é o inverso — falha depois do insert deixa a pessoa sem
 * resposta — e essa é a troca escolhida: resposta em dobro come cota de um
 * plano de 100 por mês.
 */
async function processar(
  msg: MensagemEntrada,
  bruto: string,
  provedor: string,
  headers: Headers
): Promise<{ gravou: boolean; respondeu: boolean }> {
  const recebidaId = await gravar(msg, bruto, provedor);
  if (!recebidaId) return { gravou: false, respondeu: false };

  // Sem telefone (grupo, @lid) não há a quem responder.
  if (!msg.telefone) return { gravou: true, respondeu: false };

  const atendimento = await atender(msg, baseUrl(headers));
  if (!atendimento.resposta) return { gravou: true, respondeu: false };

  const r = await responder({
    telefone: msg.telefone,
    texto: atendimento.resposta,
    recebidaId,
    conhecido: atendimento.identidade.conhecido,
    entregaId: atendimento.entregaId,
  });

  if (!r.enviada) console.log(`[whatsapp] sem resposta para ${msg.telefone}: ${r.motivo}`);
  return { gravou: true, respondeu: r.enviada };
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
  const portaria = portao(provedor, raw, headers);
  if ("recusa" in portaria) return portaria.recusa;

  const { assinatura } = portaria;
  const payload = comoJson(raw);
  const bruto = envelope(raw, payload, assinatura, headers);

  try {
    const reconhecidas = provedor.parseEntrada(payload);
    const mensagens = reconhecidas.length > 0 ? reconhecidas : [entradaDeDescarte(raw)];

    let gravadas = 0;
    let respondidas = 0;
    for (const msg of mensagens) {
      const r = await processar(msg, bruto, provedor.nome, headers);
      if (r.gravou) gravadas++;
      if (r.respondeu) respondidas++;
    }

    return { status: 200, corpo: { ok: true, gravadas, respondidas } };
  } catch (erro) {
    console.error("[whatsapp] falha ao processar mensagem recebida:", erro);
    return { status: 200, corpo: { ok: false, motivo: "falha ao gravar" } };
  }
}
