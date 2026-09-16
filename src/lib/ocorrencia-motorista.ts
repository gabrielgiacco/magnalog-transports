/**
 * Motivos que o motorista pode escolher pelo link, mapeados nos tipos que a
 * equipe já usa em Ocorrencia.tipo. Subconjunto de propósito: ATRASO, por
 * exemplo, é julgamento da equipe, não do motorista.
 *
 * Módulo puro (sem prisma) porque a tela do motorista importa os rótulos.
 */
export const MOTIVOS_MOTORISTA: Record<string, string> = {
  ENDERECO_NAO_ENCONTRADO: "Não achei o endereço",
  CLIENTE_AUSENTE: "Cliente fechado / ausente — volto depois",
  RECUSA: "Cliente recusou",
  AVARIA: "Mercadoria avariada",
  OUTROS: "Outro",
};

/** Marca na descricao que identifica ocorrência aberta pelo motorista. */
export const PREFIXO_MOTORISTA = "[Motorista]";
