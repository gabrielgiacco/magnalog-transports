// Cliente da API v3 do Pingo Notify (envio de WhatsApp).
//
// Plano gratuito em uso: 1 conexão, 100 mensagens/mês, 600 caracteres, só texto.
// A API não expõe a cota restante — quem conta somos nós, em src/lib/whatsapp-cota.ts.
//
// Atenção: a conexão do plano gratuito é não-oficial (QR Code), fora dos termos
// da Meta. O número usado pode ser banido — use um chip dedicado. Migrar para a
// conexão oficial depois é só trocar PINGO_CONNECTION_ID.

const API_BASE = "https://api.pingonotify.com/v3";
const TIMEOUT_MS = 15000;

export class PingoError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function credenciais(): { key: string; connectionId: string } {
  const key = process.env.PINGO_API_KEY;
  const connectionId = process.env.PINGO_CONNECTION_ID;

  if (!key) {
    throw new PingoError(
      "API Key não configurada. Adicione PINGO_API_KEY nas variáveis de ambiente.",
      500
    );
  }
  if (!connectionId) {
    throw new PingoError(
      "Conexão não configurada. Adicione PINGO_CONNECTION_ID nas variáveis de ambiente.",
      500
    );
  }
  return { key, connectionId };
}

/** Erros da API traduzidos. */
function erroPadrao(status: number): PingoError | null {
  switch (status) {
    case 400: return new PingoError("Número ou mensagem em formato inválido.", 400);
    case 401: return new PingoError("API Key do Pingo inválida ou expirada.", 401);
    case 402: return new PingoError("Cota do plano Pingo esgotada. Aguarde o próximo mês ou faça upgrade.", 402);
    case 404: return new PingoError("Conexão não encontrada no Pingo. Verifique PINGO_CONNECTION_ID.", 404);
    case 422: return new PingoError("Fora da janela de 24h — a Meta exige um template aprovado para este contato.", 422);
    case 429: return new PingoError("Limite de envio do Pingo atingido. Tente de novo em alguns minutos.", 429);
    default: return null;
  }
}

/** Confirma se dá para tentar enviar, sem lançar. Usado pela tela de configurações. */
export function credenciaisConfiguradas(): boolean {
  return Boolean(process.env.PINGO_API_KEY && process.env.PINGO_CONNECTION_ID);
}

/**
 * Envia uma mensagem de texto. `to` precisa estar em E.164 sem "+"
 * (use normalizarTelefoneBR antes).
 *
 * Sem retry, deliberadamente: reenviar depois de um timeout pode duplicar uma
 * mensagem que o Pingo já cobrou, gastando cota em dobro. Falhou, quem decide
 * se tenta de novo é o usuário.
 */
export async function enviarTexto(to: string, text: string): Promise<{ providerId: string | null }> {
  const { key, connectionId } = credenciais();

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/connections/${connectionId}/chats/messages`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ to, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e: any) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    throw new PingoError(
      timeout
        ? "O Pingo não respondeu a tempo. A mensagem PODE ter sido enviada — confira no WhatsApp antes de tentar de novo."
        : "Não foi possível falar com o Pingo. Verifique a conexão.",
      504
    );
  }

  if (!res.ok) {
    const err = erroPadrao(res.status);
    if (err) throw err;
    throw new PingoError(`Erro do Pingo (HTTP ${res.status}). Tente novamente.`, 502);
  }

  // O formato da resposta varia entre versões; o id é conveniência, não requisito.
  let providerId: string | null = null;
  try {
    const dados = await res.json();
    providerId = dados?.id || dados?.messageId || dados?.data?.id || null;
  } catch {
    providerId = null;
  }

  return { providerId };
}
