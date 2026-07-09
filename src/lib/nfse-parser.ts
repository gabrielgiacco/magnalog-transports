import { XMLParser } from "fast-xml-parser";

// Parser NFS-e padrão ABRASF (usado pela maioria das prefeituras, incluindo Aparecida de Goiânia).
// Não é 100% compatível com todas — alguns municípios têm variações. Se um XML de outro
// município não parsear, a gente ajusta pontualmente aqui.

export interface NfseParsed {
  numero: string;
  codigoVerificacao: string | null;
  dataEmissao: Date | null;
  valorServicos: number;
  valorIss: number;
  aliquota: number;
  prestador: {
    cnpj: string;
    razao: string | null;
  };
  tomador: {
    cnpj: string;
    razao: string | null;
    municipio: string | null;
    uf: string | null;
  };
  discriminacao: string | null;
  informacoesAdicionais: string | null;
  /** Número da NF-e mencionado na descrição (ex: "REFERENTE A PALETIZACAO NF 105843" → "105843") */
  nfNumeroReferenciado: string | null;
}

function cleanCnpj(v: any): string {
  return String(v ?? "").replace(/\D/g, "");
}

function toNumber(v: any): number {
  if (v === undefined || v === null || v === "") return 0;
  const s = String(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Percorre um objeto XML e retorna o primeiro nó cujo nome corresponda ao regex, sem se importar com namespace. */
function findFirst(obj: any, nameRegex: RegExp): any {
  if (obj == null || typeof obj !== "object") return null;
  const stack: any[] = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null || typeof cur !== "object") continue;
    if (Array.isArray(cur)) {
      for (const it of cur) stack.push(it);
      continue;
    }
    for (const key of Object.keys(cur)) {
      const localName = key.split(":").pop() || key;
      if (nameRegex.test(localName)) return cur[key];
      stack.push(cur[key]);
    }
  }
  return null;
}

function getText(node: any): string | null {
  if (node == null) return null;
  if (typeof node === "string" || typeof node === "number") return String(node).trim() || null;
  if (typeof node === "object" && node["#text"] !== undefined) {
    return String(node["#text"]).trim() || null;
  }
  return null;
}

function parseIsoDate(v: any): Date | null {
  const s = getText(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Extrai "REFERENTE A ... NF <numero>" ou "NF-e <numero>" ou "Nota Fiscal <numero>". */
function extractNfNumeroReferenciado(text: string | null): string | null {
  if (!text) return null;
  // Padrões comuns: "NF 105843", "NF-e 105843", "Nota Fiscal 105843", "NFe 105843"
  const re = /\b(?:NF(?:-?e)?|Nota\s+Fiscal)\s*[:#]?\s*(\d{3,10})\b/i;
  const m = text.match(re);
  return m ? m[1] : null;
}

export function parseNfseXml(xml: string): NfseParsed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
    removeNSPrefix: true,
  });
  const raw = parser.parse(xml);

  // A raiz costuma ser CompNfse ou InfNfse — busca robusta ignora
  const inf = findFirst(raw, /^InfNfse$/i) || raw;

  const numero = getText(findFirst(inf, /^Numero$/i)) || "";
  const codigoVerificacao = getText(findFirst(inf, /^CodigoVerificacao$/i));
  const dataEmissao = parseIsoDate(findFirst(inf, /^DataEmissao$/i));

  // Valores
  const valores = findFirst(inf, /^Valores$/i) || {};
  const valorServicos = toNumber(getText(findFirst(valores, /^ValorServicos$/i)));
  const valorIss = toNumber(getText(findFirst(valores, /^ValorIss$/i))) || toNumber(getText(findFirst(valores, /^ValorIssqn$/i)));
  const aliquota = toNumber(getText(findFirst(valores, /^Aliquota$/i)));

  // Prestador
  const prestadorNode = findFirst(inf, /^PrestadorServico$/i) || findFirst(inf, /^Prestador$/i);
  const prestadorCnpj = cleanCnpj(getText(findFirst(prestadorNode, /^Cnpj$/i)) || getText(findFirst(inf, /^Cnpj$/i)));
  const prestadorRazao = getText(findFirst(prestadorNode, /^RazaoSocial$/i));

  // Tomador
  const tomadorNode = findFirst(inf, /^Tomador$/i) || findFirst(inf, /^TomadorServico$/i);
  const tomadorCnpj = cleanCnpj(getText(findFirst(tomadorNode, /^Cnpj$/i)));
  const tomadorRazao = getText(findFirst(tomadorNode, /^RazaoSocial$/i));
  const endTomador = findFirst(tomadorNode, /^Endereco$/i);
  const tomadorMunicipio = getText(findFirst(endTomador, /^Municipio$/i)) || getText(findFirst(endTomador, /^CodigoMunicipio$/i));
  const tomadorUf = getText(findFirst(endTomador, /^Uf$/i));

  const servico = findFirst(inf, /^Servico$/i);
  const discriminacao =
    getText(findFirst(servico, /^Discriminacao$/i)) ||
    getText(findFirst(inf, /^Discriminacao$/i));
  const informacoesAdicionais =
    getText(findFirst(inf, /^InformacoesAdicionais$/i)) ||
    getText(findFirst(inf, /^InformacoesComplementares$/i));

  const textoBusca = [discriminacao, informacoesAdicionais].filter(Boolean).join(" ");
  const nfNumeroReferenciado = extractNfNumeroReferenciado(textoBusca);

  return {
    numero,
    codigoVerificacao,
    dataEmissao,
    valorServicos,
    valorIss,
    aliquota,
    prestador: { cnpj: prestadorCnpj, razao: prestadorRazao },
    tomador: {
      cnpj: tomadorCnpj,
      razao: tomadorRazao,
      municipio: tomadorMunicipio,
      uf: tomadorUf,
    },
    discriminacao,
    informacoesAdicionais,
    nfNumeroReferenciado,
  };
}
