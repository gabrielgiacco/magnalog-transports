/**
 * Peso e volume de uma NF calculados pelos itens, para quando o emitente nao
 * preenche o bloco de volumes do transporte (ex.: Natural Mais, que emite com
 * modFrete 9 e sem <vol>). Puro — sem Prisma, sem I/O.
 *
 * Peso e o CONTEUDO declarado na descricao, com ml = grama (decisao do dono):
 * "12X300 ML" pesa 3,6 kg por unidade comercial. Garrafa e filme nao entram.
 * Item sem tamanho reconhecivel fica fora da soma — nao se inventa numero.
 */

export interface ItemParaCarga {
  descricao: string;
  unidade: string; // uCom
  quantidade: number; // qCom
}

export interface CargaEstimada {
  volumes: number;
  pesoKg: number;
  itensSemPeso: number;
  itensSemVolume: number;
}

/** Unidades comerciais que sao uma embalagem fechada: cada uma conta 1 volume. */
const UNIDADES_EMBALAGEM = new Set([
  "FAR", "FARDO", "FD", "FDO", "FRD", "CX", "CXA", "CAIXA", "PCT", "PACOTE",
  "SC", "SACO", "BD", "BALDE", "GL", "GALAO", "DP", "DISPLAY",
]);

/** Unidades em que um tamanho solto ("2L") e o tamanho da propria unidade. */
const UNIDADES_AVULSAS = new Set(["UN", "UND", "UNID", "UNIDADE"]);

const KG_POR_UNIDADE_MEDIDA: Record<string, number> = {
  ML: 0.001, G: 0.001, GR: 0.001, L: 1, LT: 1, LTS: 1, KG: 1,
};

const MEDIDA = "(ML|LTS|LT|L|GR|G|KG)";
// "12X300 ML", "6x900ml", "4 X 1,5 L"
const MULTIPLO_REGEX = new RegExp(`(\\d+)\\s*[xX]\\s*(\\d+(?:[.,]\\d+)?)\\s*${MEDIDA}\\b`, "i");
// "1,5L", "500 G"
const TAMANHO_REGEX = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${MEDIDA}\\b`, "i");

const numero = (s: string) => parseFloat(s.replace(",", "."));

/** Peso em kg de UMA unidade comercial do item, ou null se a descricao nao diz. */
export function pesoPorUnidadeKg(descricao: string, unidade: string): number | null {
  const multiplo = descricao.match(MULTIPLO_REGEX);
  if (multiplo) {
    const [, qtd, tamanho, medida] = multiplo;
    return parseInt(qtd, 10) * numero(tamanho) * KG_POR_UNIDADE_MEDIDA[medida.toUpperCase()];
  }
  if (UNIDADES_AVULSAS.has(unidade.trim().toUpperCase())) {
    const solto = descricao.match(TAMANHO_REGEX);
    if (solto) return numero(solto[1]) * KG_POR_UNIDADE_MEDIDA[solto[2].toUpperCase()];
  }
  return null;
}

export function estimarCargaPelosItens(itens: ItemParaCarga[]): CargaEstimada {
  let volumes = 0;
  let pesoKg = 0;
  let itensSemPeso = 0;
  let itensSemVolume = 0;

  for (const item of itens) {
    const qtd = item.quantidade || 0;
    if (UNIDADES_EMBALAGEM.has(item.unidade.trim().toUpperCase())) volumes += qtd;
    else itensSemVolume++;

    const peso = pesoPorUnidadeKg(item.descricao, item.unidade);
    if (peso === null) itensSemPeso++;
    else pesoKg += peso * qtd;
  }

  return {
    volumes: Math.round(volumes),
    pesoKg: Math.round(pesoKg * 1000) / 1000,
    itensSemPeso,
    itensSemVolume,
  };
}
