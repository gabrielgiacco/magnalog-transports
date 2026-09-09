// Adaptador da Pingo Notify para o contrato de ProvedorWhats.
//
// O parser foi escrito contra payloads REAIS capturados em 09/09/2026, não
// contra documentação — a Pingo não publica o formato. O envelope é:
//
//   { event, connectionId, remoteJid, sender, data: { key, pushName, status,
//     message, messageType, contextInfo, source, isAiMessage } }
//
// O envio continua sendo o src/lib/pingo.ts de sempre; aqui só se delega.

import crypto from "node:crypto";
import { enviarTexto, credenciaisConfiguradas } from "@/lib/pingo";
import { normalizarTelefoneBR } from "@/lib/telefone";
import type {
  MensagemEntrada,
  ProvedorWhats,
  ResultadoAssinatura,
  TipoEntrada,
} from "./provider";

/** Confirmados na captura real. */
const HEADER_ASSINATURA = "x-pingo-signature-256";
const HEADER_TIMESTAMP = "x-pingo-timestamp";

/** Assinatura velha demais é replay de uma requisição legítima. */
const TOLERANCIA_TIMESTAMP_S = 300;

/** messageType que carrega texto. */
const TIPOS_TEXTO = new Set(["conversation", "extendedTextMessage"]);

/** messageType de localização — pino fixo e localização em tempo real. */
const TIPOS_LOCALIZACAO = new Set(["locationMessage", "liveLocationMessage"]);

function hmacHex(segredo: string, dados: string): string {
  return crypto.createHmac("sha256", segredo).update(dados).digest("hex");
}

/** Comparação em tempo constante, tolerante ao prefixo "sha256=". */
function bate(esperada: string, recebidaBruta: string): boolean {
  const recebida = recebidaBruta.trim().replace(/^sha256=/i, "").toLowerCase();
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(recebida, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Extrai o telefone de um JID.
 *
 * `556292627447@s.whatsapp.net` → `556292627447`. Corta o sufixo de dispositivo
 * (`:12`) que aparece quando a pessoa usa WhatsApp em mais de um aparelho.
 *
 * Devolve "" para grupo (@g.us), lista de transmissão e @lid — o endereçamento
 * novo da Meta, que não carrega o número. Sem telefone não há identidade, e sem
 * identidade não se responde nada.
 */
function telefoneDoJid(jid: unknown): string {
  if (typeof jid !== "string" || !jid) return "";
  if (!jid.endsWith("@s.whatsapp.net")) return "";

  const usuario = jid.split("@")[0].split(":")[0];
  return normalizarTelefoneBR(usuario) || "";
}

function tipoDaMensagem(messageType: unknown): TipoEntrada {
  if (typeof messageType !== "string") return "OUTRO";
  if (TIPOS_TEXTO.has(messageType)) return "TEXTO";
  if (TIPOS_LOCALIZACAO.has(messageType)) return "LOCALIZACAO";
  return "OUTRO";
}

/** `conversation` é texto simples; `extendedTextMessage` é texto com citação ou link. */
function textoDaMensagem(message: unknown): string | null {
  if (typeof message !== "object" || message === null) return null;
  const m = message as Record<string, unknown>;

  if (typeof m.conversation === "string" && m.conversation.trim()) {
    return m.conversation.trim();
  }

  const estendida = m.extendedTextMessage;
  if (typeof estendida === "object" && estendida !== null) {
    const t = (estendida as Record<string, unknown>).text;
    if (typeof t === "string" && t.trim()) return t.trim();
  }

  return null;
}

/** Número finito, ou null. Coordenada zero também não serve: é o Golfo da Guiné. */
function coordenada(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

type Objeto = Record<string, unknown>;

/** Estreita para objeto sem espalhar `as any` pelo parser. */
function objeto(valor: unknown): Objeto | null {
  return typeof valor === "object" && valor !== null ? (valor as Objeto) : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor ? valor : null;
}

/**
 * Coordenadas da mensagem de localização.
 *
 * Medido na Pingo (plano gratuito, 09/09/2026): `messageType` vem
 * `locationMessage` ou `liveLocationMessage`, mas `message` chega VAZIO — as
 * coordenadas não são entregues. Fica nulo em vez de zero para "não veio" não
 * virar "está no meridiano de Greenwich".
 */
function coordenadasDe(mensagem: unknown): { lat: number | null; lng: number | null } {
  const m = objeto(mensagem);
  const local = m ? objeto(m.locationMessage) ?? objeto(m.liveLocationMessage) : null;
  if (!local) return { lat: null, lng: null };
  return { lat: coordenada(local.degreesLatitude), lng: coordenada(local.degreesLongitude) };
}

export class PingoAdapter implements ProvedorWhats {
  readonly nome = "PINGO" as const;

  enviarTexto(to: string, text: string, timeoutMs?: number) {
    return enviarTexto(to, text, timeoutMs);
  }

  credenciaisConfiguradas(): boolean {
    return credenciaisConfiguradas();
  }

  /**
   * Confere o HMAC do corpo CRU.
   *
   * A Pingo não documenta se assina o corpo puro ou `timestamp.corpo`, então as
   * duas convenções são testadas e a que fechar é registrada. Conhecer o
   * segredo é obrigatório nas duas — a tolerância é sobre o formato, não sobre
   * a segurança.
   */
  verificarAssinatura(raw: string, headers: Headers): ResultadoAssinatura {
    const segredo = process.env.PINGO_WEBHOOK_SECRET;

    // Sem segredo, o modo espelho deixa passar. É estado temporário, só para a
    // captura inicial de payload; preencher a variável liga a exigência.
    if (!segredo) return { ok: true, conferida: false };

    const recebida = headers.get(HEADER_ASSINATURA);
    if (!recebida) return { ok: false, motivo: "sem header de assinatura", conferida: true };

    const ts = headers.get(HEADER_TIMESTAMP);
    if (ts) {
      const idade = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
      if (!Number.isFinite(idade) || idade > TOLERANCIA_TIMESTAMP_S) {
        return { ok: false, motivo: "timestamp fora da tolerância", conferida: true };
      }
      if (bate(hmacHex(segredo, `${ts}.${raw}`), recebida)) {
        return { ok: true, conferida: true, convencao: "timestamp.corpo" };
      }
    }

    if (bate(hmacHex(segredo, raw), recebida)) {
      return { ok: true, conferida: true, convencao: "corpo" };
    }

    return { ok: false, motivo: "assinatura não confere", conferida: true };
  }

  parseEntrada(payload: unknown): MensagemEntrada[] {
    const p = objeto(payload);
    if (!p || p.event !== "messages.upsert") return [];

    const data = objeto(p.data);
    const chave = data ? objeto(data.key) : null;
    if (!data || !chave) return [];

    // Nossa própria saída também dispara o evento. Responder a ela é um loop
    // que come as 100 mensagens do mês em minutos.
    if (chave.fromMe === true) return [];

    const providerId = texto(chave.id);
    if (!providerId) return [];

    return [montarEntrada(data, chave, providerId)];
  }
}

/**
 * Monta a mensagem neutra a partir do envelope da Pingo.
 *
 * ATENÇÃO ao telefone: quem escreveu está em `key.remoteJid`. O campo de topo
 * `sender` é a CONEXÃO que recebeu — confirmado na captura de 09/09/2026, em
 * que `remoteJid` era o celular do remetente e `sender`, o número da empresa.
 * Trocar os dois faria todo mundo virar a mesma pessoa e, como é o telefone que
 * autoriza ver nota fiscal, seria buraco de segurança.
 */
function montarEntrada(data: Objeto, chave: Objeto, providerId: string): MensagemEntrada {
  const messageType = data.messageType;
  const { lat, lng } = coordenadasDe(data.message);

  return {
    providerId,
    telefone: telefoneDoJid(chave.remoteJid) || telefoneDoJid(chave.remoteJidAlt),
    nomePerfil: texto(data.pushName),
    tipo: tipoDaMensagem(messageType),
    texto: textoDaMensagem(data.message),
    latitude: lat,
    longitude: lng,
    aoVivo: messageType === "liveLocationMessage",
    // A Pingo não manda messageTimestamp; a hora da chegada é a que temos.
    recebidaEm: new Date(),
  };
}
