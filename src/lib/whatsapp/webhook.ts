// Recebimento de WhatsApp — Etapa 0: MODO ESPELHO.
//
// Esta versão não responde nada e não consulta nada. Ela só guarda o que chega,
// intacto, porque o formato do payload do provedor não é documentado. Os
// registros gravados aqui são a especificação do parser da Etapa 1 — escrever o
// parser por adivinhação seria o maior risco do projeto.
//
// Enquanto estiver assim, o endpoint é incapaz de gastar cota de mensagem: não
// existe nenhuma chamada de envio neste arquivo.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Acima disto não é webhook de mensagem, é abuso. */
const MAX_CORPO_BYTES = 256 * 1024;

/** Assinatura velha demais é replay. */
const TOLERANCIA_TIMESTAMP_S = 300;

/**
 * O provedor não publica o nome do header de assinatura. Em vez de fixar um
 * palpite e descobrir o erro só em produção, conferimos os candidatos — a
 * segurança não vem do nome do header, vem de conhecer o segredo.
 */
const HEADERS_ASSINATURA = [
  "x-pingo-signature-256",
  "x-pingo-signature",
  "x-hub-signature-256",
  "x-signature-256",
  "x-webhook-signature",
];

const HEADERS_TIMESTAMP = ["x-pingo-timestamp", "x-webhook-timestamp", "x-timestamp"];

/** Nunca guardar credencial junto do payload. */
const HEADERS_OMITIDOS = new Set(["cookie", "authorization", "apikey", "x-api-key"]);

export interface ResultadoWebhook {
  status: number;
  corpo: { ok: boolean; motivo?: string; gravadas?: number };
}

function segredo(): string | null {
  return process.env.PINGO_WEBHOOK_SECRET || null;
}

function hmacHex(segredoStr: string, dados: string): string {
  return crypto.createHmac("sha256", segredoStr).update(dados).digest("hex");
}

/** Comparação em tempo constante, tolerante ao prefixo "sha256=" e ao tamanho. */
function assinaturaBate(esperada: string, recebidaBruta: string): boolean {
  const recebida = recebidaBruta.trim().replace(/^sha256=/i, "").toLowerCase();
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(recebida, "utf8");
  // timingSafeEqual exige mesmo tamanho; comparar o tamanho antes não vaza nada
  // além do que o próprio formato do hash já entrega.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Confere a assinatura do corpo CRU.
 *
 * Testa as duas convenções de mercado — HMAC do corpo puro e HMAC de
 * `timestamp.corpo` — porque o provedor não documenta qual usa. Conhecer o
 * segredo continua sendo obrigatório nas duas.
 */
export function verificarAssinatura(
  raw: string,
  headers: Headers
): { ok: boolean; motivo?: string; conferida: boolean } {
  const chave = segredo();

  // Sem segredo configurado, o modo espelho aceita para que a Etapa 0 possa
  // descobrir os nomes dos headers. É estado TEMPORÁRIO: assim que a primeira
  // captura mostrar o header certo, PINGO_WEBHOOK_SECRET tem que ser
  // preenchido, e aí o endpoint passa a exigir assinatura.
  if (!chave) return { ok: true, conferida: false };

  const recebida = HEADERS_ASSINATURA.map((h) => headers.get(h)).find(Boolean);
  if (!recebida) return { ok: false, motivo: "sem header de assinatura", conferida: true };

  const ts = HEADERS_TIMESTAMP.map((h) => headers.get(h)).find(Boolean);

  if (ts) {
    const idade = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
    if (!Number.isFinite(idade) || idade > TOLERANCIA_TIMESTAMP_S) {
      return { ok: false, motivo: "timestamp fora da tolerância", conferida: true };
    }
    if (assinaturaBate(hmacHex(chave, `${ts}.${raw}`), recebida)) {
      return { ok: true, conferida: true };
    }
  }

  if (assinaturaBate(hmacHex(chave, raw), recebida)) return { ok: true, conferida: true };

  return { ok: false, motivo: "assinatura não confere", conferida: true };
}

/** Headers guardados junto do payload, para a Etapa 0 saber o que chegou. */
function headersParaRegistro(headers: Headers): Record<string, string> {
  const saida: Record<string, string> = {};
  headers.forEach((valor, nome) => {
    if (!HEADERS_OMITIDOS.has(nome.toLowerCase())) saida[nome] = valor;
  });
  return saida;
}

/** Lê "a.b.0.c" sem estourar em nada que não seja objeto no meio do caminho. */
function ler(objeto: unknown, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((atual, parte) => {
    if (atual === null || typeof atual !== "object") return undefined;
    return (atual as Record<string, unknown>)[parte];
  }, objeto);
}

/** Onde o id da mensagem costuma estar, na família Baileys e na Cloud API. */
const CAMINHOS_ID = [
  "data.key.id",
  "data.messages.0.key.id",
  "messages.0.key.id",
  "key.id",
  "messageId",
  "id",
];

/**
 * Id do evento, para deduplicar.
 *
 * Tenta os caminhos usuais e, não achando, cai no hash do corpo. O hash cobre
 * exatamente o caso que importa: a retentativa do provedor manda o MESMO corpo,
 * então gera a mesma chave e a segunda gravação vira no-op.
 */
function idDoEvento(payload: unknown, raw: string): string {
  for (const caminho of CAMINHOS_ID) {
    const valor = ler(payload, caminho);
    if (typeof valor === "string" && valor.length > 0) return valor;
  }
  return "sha:" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
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

  const assinatura = verificarAssinatura(raw, headers);
  if (!assinatura.ok) {
    console.warn(`[whatsapp] webhook rejeitado: ${assinatura.motivo}`);
    return { status: 401, corpo: { ok: false, motivo: assinatura.motivo } };
  }
  if (!assinatura.conferida) {
    console.warn(
      "[whatsapp] webhook aceito SEM conferir assinatura — PINGO_WEBHOOK_SECRET não está configurado"
    );
  }

  const payload = comoJson(raw);

  const bruto = JSON.stringify({
    recebidoEm: new Date().toISOString(),
    assinaturaConferida: assinatura.conferida,
    headers: headersParaRegistro(headers),
    corpo: payload ?? raw,
  });

  try {
    await prisma.mensagemWhatsRecebida.create({
      data: {
        provedor: "PINGO",
        providerId: idDoEvento(payload, raw),
        // Etapa 0 não interpreta o payload. Telefone, tipo e coordenadas ficam
        // vazios de propósito: quem preenche é o parser da Etapa 1, escrito
        // contra os `bruto` capturados aqui.
        telefone: "",
        tipo: "OUTRO",
        bruto,
        recebidaEm: new Date(),
      },
    });
    return { status: 200, corpo: { ok: true, gravadas: 1 } };
  } catch (erro) {
    // P2002 = já processado. É a deduplicação funcionando, não um erro.
    if (codigoPrisma(erro) === "P2002") return { status: 200, corpo: { ok: true, gravadas: 0 } };

    console.error("[whatsapp] falha ao gravar mensagem recebida:", erro);
    return { status: 200, corpo: { ok: false, motivo: "falha ao gravar" } };
  }
}
