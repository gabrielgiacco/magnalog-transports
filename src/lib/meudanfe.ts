// Cliente da API v2 do Meu Danfe.
// Extraído de src/app/api/consulta-danfe/route.ts para ser reutilizável.
//
// Custos (doc oficial): só a busca por chave na Receita é cobrada (R$ 0,03).
// Envio de XML, listagem de chaves e TODO download de documento que já está
// na Área do Cliente são gratuitos.
//
// Limites da doc, respeitados aqui:
//   - máx. 10 NF/s (recomendado começar em 2/s)
//   - aguardar >= 1s entre consultas de status da mesma chave
//   - ter teto de tentativas por chave: algumas NFs nunca retornam, e insistir
//     bloqueia o IP e a conta

const API_BASE = "https://api.meudanfe.com.br/v2";
const MAX_POLLS = 15;
const POLL_INTERVAL_MS = 1500; // > 1s exigido pela doc

export type FormatoDanfe = "completo" | "simplificado" | "etiqueta" | "cupom";

/** Formato → endpoint. `da` serve NF-e e CT-e; os demais são só NF-e. */
const ENDPOINT_POR_FORMATO: Record<FormatoDanfe, string> = {
  completo: "da",
  simplificado: "simplified",
  etiqueta: "label",
  cupom: "retail",
};

export const FORMATOS_SOMENTE_NFE: FormatoDanfe[] = ["simplificado", "etiqueta", "cupom"];

export class MeuDanfeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiKey(): string {
  const k = process.env.DANFE_API_KEY;
  if (!k) {
    throw new MeuDanfeError(
      "API Key não configurada. Adicione DANFE_API_KEY nas variáveis de ambiente.",
      500
    );
  }
  return k;
}

/** Mensagens de erro da API, iguais em todos os endpoints. */
function erroPadrao(status: number): MeuDanfeError | null {
  switch (status) {
    case 400: return new MeuDanfeError("Chave de acesso inválida.", 400);
    case 401: return new MeuDanfeError("API Key inválida.", 401);
    case 402: return new MeuDanfeError("Saldo insuficiente na conta Meu Danfe.", 402);
    case 403: return new MeuDanfeError("API Key foi substituída. Gere uma nova na Área do Cliente.", 403);
    case 404: return new MeuDanfeError("Documento não está na sua Área do Cliente do Meu Danfe.", 404);
    default: return null;
  }
}

export function chaveValida(chave: string): boolean {
  // A partir do CNPJ alfanumérico, as posições 7 a 18 podem conter letras.
  return /^[0-9A-Za-z]{44}$/.test(chave) && /^\d{6}/.test(chave);
}

/**
 * Busca a NF-e na Receita e adiciona à Área do Cliente. COBRADO (R$ 0,03).
 * Devolve o XML.
 */
export async function buscarXmlPorChave(chave: string): Promise<string> {
  const key = apiKey();

  const chamarAdd = async () => {
    const res = await fetch(`${API_BASE}/fd/add/${chave}`, {
      method: "PUT",
      headers: { "Api-Key": key, "Content-Length": "0" },
    });
    const err = erroPadrao(res.status);
    if (err && res.status !== 404) throw err;
    if (!res.ok) throw new MeuDanfeError("Erro ao consultar NF-e. Tente novamente.", 502);
    return res.json();
  };

  let dados = await chamarAdd();

  let polls = 0;
  while ((dados.status === "WAITING" || dados.status === "SEARCHING") && polls < MAX_POLLS) {
    await sleep(POLL_INTERVAL_MS);
    dados = await chamarAdd();
    polls++;
  }

  if (dados.status === "NOT_FOUND") {
    throw new MeuDanfeError("NF-e não encontrada. Verifique a chave de acesso.", 404);
  }
  if (dados.status === "ERROR") {
    throw new MeuDanfeError(dados.statusMessage || "Erro ao consultar NF-e na Receita Federal.", 422);
  }
  if (dados.status !== "OK") {
    throw new MeuDanfeError("Consulta expirou. Tente novamente em alguns instantes.", 504);
  }

  return baixarXml(chave);
}

/** Download do XML de documento já presente na Área do Cliente. GRÁTIS. */
export async function baixarXml(chave: string): Promise<string> {
  const res = await fetch(`${API_BASE}/fd/get/xml/${chave}`, {
    headers: { "Api-Key": apiKey() },
  });
  const err = erroPadrao(res.status);
  if (err) throw err;
  if (!res.ok) throw new MeuDanfeError("Erro ao baixar o XML da NF-e.", 502);

  const dados = await res.json();
  if (!dados.data) throw new MeuDanfeError("XML não disponível para esta NF-e.", 422);
  return dados.data;
}

/**
 * Envia o XML para a Área do Cliente. GRÁTIS.
 * A doc avisa que envios repetidos do MESMO XML bloqueiam a conta — por isso
 * só deve ser chamado depois de um 404 no download, nunca preventivamente.
 */
export async function enviarXml(xml: string): Promise<void> {
  const res = await fetch(`${API_BASE}/fd/add/xml`, {
    method: "PUT",
    headers: { "Api-Key": apiKey(), "Content-Type": "text/plain" },
    body: xml,
  });
  const err = erroPadrao(res.status);
  if (err) throw err;
  if (!res.ok) throw new MeuDanfeError("Erro ao enviar o XML ao Meu Danfe.", 502);
}

export interface PdfDanfe {
  nome: string;
  tipo: string;
  bytes: Buffer;
}

/**
 * Download do PDF de documento já presente na Área do Cliente. GRÁTIS.
 * Lança MeuDanfeError com status 404 quando o documento não está lá — quem
 * chama decide se envia o XML e tenta de novo.
 */
export async function baixarPdf(chave: string, formato: FormatoDanfe): Promise<PdfDanfe> {
  const endpoint = ENDPOINT_POR_FORMATO[formato];
  const res = await fetch(`${API_BASE}/fd/get/${endpoint}/${chave}`, {
    headers: { "Api-Key": apiKey() },
  });
  const err = erroPadrao(res.status);
  if (err) throw err;
  if (!res.ok) throw new MeuDanfeError("Erro ao gerar o PDF no Meu Danfe.", 502);

  const dados = await res.json();
  if (!dados.data) throw new MeuDanfeError("PDF não disponível para este documento.", 422);

  return {
    nome: dados.name || `${chave}.pdf`,
    tipo: dados.type || "NFE",
    bytes: Buffer.from(dados.data, "base64"),
  };
}

export interface PaginaChaves {
  chaves: string[];
  pagina: number;
  totalPaginas: number;
  totalDocumentos: number;
}

/**
 * Lista as chaves da Área do Cliente. GRÁTIS. 50 por página (fixo), ordenadas
 * da mais antiga para a mais recente.
 *
 * O filtro `doc` casa emitente, destinatário ou remetente — NÃO transportador.
 * Para uma transportadora, filtrar pelo próprio CNPJ não traz as cargas.
 */
export async function listarChaves(
  tipo: "NFE" | "CTE",
  pagina = 1,
  doc?: string
): Promise<PaginaChaves> {
  const params = new URLSearchParams({ page: String(pagina) });
  if (doc) params.set("doc", doc.replace(/\D/g, ""));

  const res = await fetch(`${API_BASE}/fd/my/${tipo}?${params}`, {
    headers: { "Api-Key": apiKey() },
  });
  const err = erroPadrao(res.status);
  if (err) throw err;
  if (!res.ok) throw new MeuDanfeError("Erro ao listar documentos do Meu Danfe.", 502);

  const dados = await res.json();
  if (dados.status === "PAGE_NOT_FOUND") {
    throw new MeuDanfeError(dados.statusMessage || "Página não encontrada.", 404);
  }
  if (dados.status === "INVALID_DOC") {
    throw new MeuDanfeError("CPF/CNPJ informado no filtro é inválido.", 400);
  }
  if (dados.status !== "OK") {
    throw new MeuDanfeError(dados.statusMessage || "Erro ao listar documentos.", 502);
  }

  const page = dados.page || {};
  return {
    chaves: page.elements || [],
    pagina: page.number || pagina,
    totalPaginas: page.totalPages || 0,
    totalDocumentos: page.totalElements || 0,
  };
}
