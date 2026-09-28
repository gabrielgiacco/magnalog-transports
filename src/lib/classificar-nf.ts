import { XMLParser } from "fast-xml-parser";
import type { TipoContaPagar } from "@prisma/client";

/**
 * Classificacao de uma NF-e ja baixada (o XML chega pronto — esta funcao nao
 * busca nada em lugar nenhum) como FRETE ou COMPRA da propria Magna Log.
 *
 * O discriminador e o destinatario da nota, nao o emitente: a mesma empresa
 * pode aparecer como emitente tanto de frete quanto de compra, mas so a
 * Magna Log (ou uma filial dela) aparece como destinataria das notas que sao
 * compra.
 */
export interface DadosNfClassificada {
  chave: string;
  emitenteCnpj: string;
  emitenteRazao: string;
  destinatarioCnpj: string;
  destinatarioRazao: string;
  numero: string;
  serie: string | null;
  dataEmissao: string | null; // ISO
  valorTotal: number;
  classe: "FRETE" | "COMPRA";
  tipoSugerido: TipoContaPagar; // so faz sentido quando classe = COMPRA
}

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Maiusculo e sem acento, para casar palavra-chave sem depender da grafia do XML. */
function normalizar(texto: string): string {
  return texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Isto e um palpite pelo NOME do fornecedor (razao social do emitente), nao
 * por nenhum dado fiscal da NF — o usuario ve e pode trocar antes de
 * confirmar a conta a pagar.
 */
function sugerirTipo(emitenteRazao: string): TipoContaPagar {
  const razao = normalizar(emitenteRazao);
  if (/POSTO|PETROLEO|COMBUSTIVEL|AUTO POSTO|DISTRIBUIDORA DE PETROLEO/.test(razao)) {
    return "ABASTECIMENTO";
  }
  if (/PEDAGIO|SEM PARAR|CONECTCAR|VELOE/.test(razao)) {
    return "PEDAGIO";
  }
  return "OUTROS";
}

function parseDataEmissao(ide: any): string | null {
  const bruto = ide?.dhEmi || ide?.dEmi;
  if (!bruto) return null;
  const d = new Date(bruto);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Classifica uma NF-e em FRETE (destinatario e terceiro) ou COMPRA
 * (destinatario e a propria Magna Log ou uma de suas filiais).
 *
 * Nunca lanca — devolve null quando o XML nao pode ser interpretado, para
 * quem chama decidir o que fazer com uma chave invalida sem precisar de
 * try/catch.
 */
export function classificarNf(
  xml: string,
  chave: string,
  cnpjsProprios: string[]
): DadosNfClassificada | null {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: false,
      numberParseOptions: { hex: false, leadingZeros: false, skipLike: /.*/ },
    });
    const parsed = parser.parse(xml);
    const nfe = parsed?.nfeProc?.NFe || parsed?.NFe;
    const infNFe = nfe?.infNFe;
    if (!infNFe) return null;

    const emit = infNFe.emit || {};
    const dest = infNFe.dest || {};
    const ide = infNFe.ide || {};
    const total = infNFe.total?.ICMSTot || {};

    const emitenteCnpj = soDigitos(emit.CNPJ || emit.CPF);
    const destinatarioCnpj = soDigitos(dest.CNPJ || dest.CPF);
    const proprios = cnpjsProprios.map(soDigitos).filter(Boolean);

    return {
      chave,
      emitenteCnpj,
      emitenteRazao: String(emit.xNome || ""),
      destinatarioCnpj,
      destinatarioRazao: String(dest.xNome || ""),
      numero: String(ide.nNF || ""),
      serie: ide.serie != null ? String(ide.serie) : null,
      dataEmissao: parseDataEmissao(ide),
      valorTotal: parseFloat(String(total.vNF || "0")) || 0,
      classe: proprios.includes(destinatarioCnpj) ? "COMPRA" : "FRETE",
      tipoSugerido: sugerirTipo(String(emit.xNome || "")),
    };
  } catch {
    return null;
  }
}
