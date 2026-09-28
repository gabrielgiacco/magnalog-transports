// Decodificador da chave de acesso de NF-e/CT-e (44 dígitos).
//
// A chave carrega, por posição, campos que hoje só aparecem crus na tela de
// sincronização: UF, mês/ano de emissão, CNPJ do emitente, modelo, série e
// número da nota. Tudo isso é público e gratuito — não depende de baixar o
// XML. O destinatário NÃO está na chave; só existe depois do download.
//
// Puro: sem Prisma, sem I/O. Layout (1-indexado):
//   1-2   cUF          3-6  AAMM         7-20  CNPJ do emitente
//   21-22 modelo       23-25 série       26-34 número da NF
//   35    tpEmis        36-43 código numérico   44 DV

const UF_POR_CODIGO: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

export interface ChaveDecodificada {
  uf: string; // sigla, ex "GO" — codigo desconhecido cai no proprio codigo
  codigoUf: string;
  anoMes: string; // "09/2026"
  emitenteCnpj: string; // 14 digitos
  modelo: string; // "55" | "57"
  serie: string; // sem zeros a esquerda
  numero: string; // sem zeros a esquerda
}

/** Decodifica os campos que a própria chave carrega. `null` se não tiver 44 dígitos. */
export function decodificarChave(chave: string): ChaveDecodificada | null {
  const digitos = chave.replace(/\D/g, "");
  if (digitos.length !== 44) return null;

  const codigoUf = digitos.slice(0, 2);
  const ano = digitos.slice(2, 4);
  const mes = digitos.slice(4, 6);
  const emitenteCnpj = digitos.slice(6, 20);
  const modelo = digitos.slice(20, 22);
  const serie = digitos.slice(22, 25);
  const numero = digitos.slice(25, 34);

  return {
    uf: UF_POR_CODIGO[codigoUf] ?? codigoUf,
    codigoUf,
    anoMes: `${mes}/20${ano}`,
    emitenteCnpj,
    modelo,
    serie: String(Number(serie)),
    numero: String(Number(numero)),
  };
}

/** "52.260.922/3353-92" — para exibir. */
export function formatarCnpj(cnpj: string): string {
  const n = cnpj.replace(/\D/g, "");
  if (n.length !== 14) return cnpj;
  return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}
