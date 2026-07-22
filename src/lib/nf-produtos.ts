import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/prisma";

export type ProdutoParsed = {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  ean: string;
};

export type EmitenteParsed = {
  cnpj: string;
  razaoSocial: string;
  fantasia: string;
  ie: string;
  cidade: string;
  uf: string;
  endereco: string;
  bairro: string;
  cep: string;
  telefone: string;
} | null;

export type ParseNFResult = {
  produtos: ProdutoParsed[];
  infAdicionais: string;
  infFisco: string;
  emitente: EmitenteParsed;
};

export function parseNFProducts(xmlContent: string | null): ParseNFResult {
  if (!xmlContent) return { produtos: [], infAdicionais: "", infFisco: "", emitente: null };
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: false,
      numberParseOptions: { hex: false, leadingZeros: false, skipLike: /.*/ },
    });
    const parsed = parser.parse(xmlContent);
    const nfe = parsed?.nfeProc?.NFe || parsed?.NFe;
    const infNFe = nfe?.infNFe;
    if (!infNFe) return { produtos: [], infAdicionais: "", infFisco: "", emitente: null };

    const detArray = Array.isArray(infNFe.det) ? infNFe.det : infNFe.det ? [infNFe.det] : [];
    const produtos: ProdutoParsed[] = detArray.map((d: any) => {
      const p = d.prod || {};
      return {
        codigo: String(p.cProd || ""),
        descricao: String(p.xProd || ""),
        ncm: String(p.NCM || ""),
        cfop: String(p.CFOP || ""),
        unidade: String(p.uCom || ""),
        quantidade: parseFloat(String(p.qCom || "0")) || 0,
        valorUnitario: parseFloat(String(p.vUnCom || "0")) || 0,
        valorTotal: parseFloat(String(p.vProd || "0")) || 0,
        ean: String(p.cEAN || ""),
      };
    });

    const infAdic = infNFe.infAdic || {};
    const infAdicionais = String(infAdic.infCpl || "");
    const infFisco = String(infAdic.infAdFisco || "");

    const emit = infNFe.emit || {};
    const enderEmit = emit.enderEmit || {};
    const emitente: EmitenteParsed = {
      cnpj: String(emit.CNPJ || emit.CPF || ""),
      razaoSocial: String(emit.xNome || ""),
      fantasia: String(emit.xFant || ""),
      ie: String(emit.IE || ""),
      cidade: String(enderEmit.xMun || ""),
      uf: String(enderEmit.UF || ""),
      endereco: `${enderEmit.xLgr || ""} ${enderEmit.nro || ""}`.trim(),
      bairro: String(enderEmit.xBairro || ""),
      cep: String(enderEmit.CEP || ""),
      telefone: String(enderEmit.fone || ""),
    };

    return { produtos, infAdicionais, infFisco, emitente };
  } catch {
    return { produtos: [], infAdicionais: "", infFisco: "", emitente: null };
  }
}

export type NormaLite = {
  fornecedorCnpj: string;
  codigoProduto: string;
  lastro: number;
  altura: number;
  quantidadeCaixasPalete: number;
  embalagem: string | null;
};

/** Carrega normas de paletização para um destinatário + lista de fornecedores. */
export async function carregarNormasPorDestinatario(
  clienteCnpj: string,
  fornecedoresCnpjs: string[]
): Promise<Map<string, NormaLite>> {
  const cleanCliente = String(clienteCnpj).replace(/\D/g, "");
  const cleanFornecedores = fornecedoresCnpjs.map((c) => String(c).replace(/\D/g, "")).filter(Boolean);

  if (!cleanCliente || cleanFornecedores.length === 0) return new Map();

  const normas = await prisma.normaPaletizacao.findMany({
    where: {
      clienteCnpj: cleanCliente,
      fornecedorCnpj: { in: cleanFornecedores },
    },
  });

  const map = new Map<string, NormaLite>();
  for (const n of normas) {
    map.set(`${n.fornecedorCnpj}_${n.codigoProduto}`, {
      fornecedorCnpj: n.fornecedorCnpj,
      codigoProduto: n.codigoProduto,
      lastro: n.lastro,
      altura: n.altura,
      quantidadeCaixasPalete: n.quantidadeCaixasPalete,
      embalagem: n.embalagem,
    });
  }
  return map;
}

export type LinhaConferencia = {
  codigo: string;
  descricao: string;
  quantidade: number;
  fornecedorCnpj: string;
  fornecedorRazao: string;
  nfNumeros: string[];
  norma: NormaLite | null;
  paletesEstimados: number;
};

/**
 * Agrega produtos de várias NFs (assume mesmo destinatário) por
 * (fornecedorCnpj + codigoProduto) e cruza com normas de paletização.
 * Espelha a lógica de PaletizacaoTab em entregas/[id]/page.tsx.
 */
export function agregarProdutosParaConferencia(
  notas: Array<{ numero: string; emitenteCnpj: string | null; emitenteRazao: string | null; xmlOriginal: string | null }>,
  normasMap: Map<string, NormaLite>
): LinhaConferencia[] {
  const produtosMap = new Map<string, LinhaConferencia>();

  for (const nf of notas) {
    const { produtos } = parseNFProducts(nf.xmlOriginal);
    const cleanFornecedor = String(nf.emitenteCnpj || "").replace(/\D/g, "");

    for (const p of produtos) {
      const key = `${cleanFornecedor}_${p.codigo}`;
      const existente = produtosMap.get(key);
      if (existente) {
        existente.quantidade += p.quantidade || 0;
        if (!existente.nfNumeros.includes(nf.numero)) existente.nfNumeros.push(nf.numero);
      } else {
        const norma = normasMap.get(key) || null;
        produtosMap.set(key, {
          codigo: p.codigo,
          descricao: p.descricao,
          quantidade: p.quantidade || 0,
          fornecedorCnpj: nf.emitenteCnpj || "",
          fornecedorRazao: nf.emitenteRazao || "",
          nfNumeros: [nf.numero],
          norma,
          paletesEstimados: 0,
        });
      }
    }
  }

  // Calcula paletes ao final (evita recontagem incremental)
  const linhas = Array.from(produtosMap.values());
  for (const linha of linhas) {
    if (linha.norma) {
      linha.paletesEstimados = linha.quantidade / (linha.norma.quantidadeCaixasPalete || 1);
    }
  }

  return linhas;
}
