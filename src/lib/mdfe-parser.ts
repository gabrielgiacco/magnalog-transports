import { XMLParser } from "fast-xml-parser";

// Escrito sobre MDF-e reais da Magna Log (layout 3.00, modal rodoviário).
// Dois achados dos arquivos de verdade que a especificação não deixa óbvio:
//   1. dhIniViagem é opcional e NÃO vem nos manifestos deles — cai para dhEmi.
//   2. tot traz só qCTe quando não há NF-e avulsa; qNFe simplesmente não existe.

export interface MdfeDocumentoData {
  tipo: "CTE" | "NFE";
  chaveAcesso: string;
  municipioDescarga: string | null;
  codigoMunicipioDescarga: string | null;
}

export interface MdfeData {
  chaveAcesso: string;
  numero: string;
  serie: string | null;
  modelo: string;
  emitenteCnpj: string;
  emitenteNome: string | null;
  ufInicio: string;
  ufFim: string;
  municipioCarregamento: string | null;
  dataEmissao: Date | null;
  dataInicioViagem: Date | null;
  placaTracao: string | null;
  placaReboque: string | null;
  rntrc: string | null;
  condutorNome: string | null;
  condutorCpf: string | null;
  contratanteCnpj: string | null;
  qtdCTe: number;
  qtdNFe: number;
  valorCarga: number;
  pesoCarga: number;
  /** cStat do protocolo: 100 = autorizado. Sem protocolo, o manifesto não vale. */
  cStat: string | null;
  documentos: MdfeDocumentoData[];
}

/** fast-xml-parser devolve objeto quando há 1 e array quando há vários. */
function lista<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function texto(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numero(v: any): number {
  const n = parseFloat(String(v ?? "0"));
  return isFinite(n) ? n : 0;
}

function data(v: any): Date | null {
  const s = texto(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function ehXmlMdfe(xml: string): boolean {
  return xml.includes("<mdfeProc") || xml.includes("<MDFe") || xml.includes("infMDFe");
}

/** Evento de encerramento: tpEvento 110112. */
export function ehEventoEncerramentoMdfe(xml: string): boolean {
  return xml.includes("110112") && (xml.includes("procEventoMDFe") || xml.includes("evEncMDFe"));
}

export interface EncerramentoData {
  chaveAcesso: string;
  dataEncerramento: Date | null;
  protocolo: string | null;
}

export function parseEncerramentoMdfe(xmlContent: string): EncerramentoData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    numberParseOptions: { hex: false, leadingZeros: false, skipLike: /.*/ },
  });
  const p = parser.parse(xmlContent);

  const evento = p?.procEventoMDFe?.eventoMDFe || p?.eventoMDFe;
  const infEvento = evento?.infEvento;
  const ret = p?.procEventoMDFe?.retEventoMDFe?.infEvento;

  const chave = texto(infEvento?.chMDFe) || texto(ret?.chMDFe) || "";
  if (chave.length !== 44) {
    throw new Error("XML de encerramento inválido: chave do MDF-e não encontrada");
  }

  const det = infEvento?.detEvento?.evEncMDFe;
  return {
    chaveAcesso: chave,
    dataEncerramento: data(det?.dtEnc) || data(infEvento?.dhEvento) || data(ret?.dhRegEvento),
    protocolo: texto(ret?.nProt) || texto(infEvento?.nProt),
  };
}

export function parseMdfeXML(xmlContent: string): MdfeData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    numberParseOptions: { hex: false, leadingZeros: false, skipLike: /.*/ },
  });

  const parsed = parser.parse(xmlContent);
  const mdfe = parsed?.mdfeProc?.MDFe || parsed?.MDFe;
  if (!mdfe) throw new Error("XML inválido: estrutura MDFe não encontrada");

  const inf = mdfe.infMDFe;
  if (!inf) throw new Error("XML inválido: infMDFe não encontrado");

  const prot = parsed?.mdfeProc?.protMDFe?.infProt;

  const chaveAcesso =
    (inf["@_Id"] as string)?.replace("MDFe", "") ||
    texto(prot?.chMDFe) ||
    "";
  if (chaveAcesso.length !== 44) {
    throw new Error(`Chave de acesso do MDF-e inválida: ${chaveAcesso}`);
  }

  const ide = inf.ide || {};
  const emit = inf.emit || {};
  const rodo = inf.infModal?.rodo || {};
  const tracao = rodo.veicTracao || {};
  const tot = inf.tot || {};

  // Um MDF-e pode ter vários blocos de descarga, cada um com vários documentos.
  const documentos: MdfeDocumentoData[] = [];
  for (const bloco of lista<any>(inf.infDoc?.infMunDescarga)) {
    const municipio = texto(bloco.xMunDescarga);
    const codigoMunicipio = texto(bloco.cMunDescarga);
    for (const c of lista<any>(bloco.infCTe)) {
      const ch = texto(c.chCTe);
      if (ch) documentos.push({ tipo: "CTE", chaveAcesso: ch, municipioDescarga: municipio, codigoMunicipioDescarga: codigoMunicipio });
    }
    for (const n of lista<any>(bloco.infNFe)) {
      const ch = texto(n.chNFe);
      if (ch) documentos.push({ tipo: "NFE", chaveAcesso: ch, municipioDescarga: municipio, codigoMunicipioDescarga: codigoMunicipio });
    }
  }

  const dataEmissao = data(ide.dhEmi);

  return {
    chaveAcesso,
    numero: texto(ide.nMDF) || "",
    serie: texto(ide.serie),
    modelo: texto(ide.mod) || "58",
    emitenteCnpj: (texto(emit.CNPJ) || "").replace(/\D/g, ""),
    emitenteNome: texto(emit.xNome),
    ufInicio: texto(ide.UFIni) || "",
    ufFim: texto(ide.UFFim) || "",
    municipioCarregamento: texto(lista<any>(ide.infMunCarrega)[0]?.xMunCarrega),
    dataEmissao,
    // dhIniViagem é opcional e não vem nos manifestos da Magna Log.
    // Sem ele, a viagem conta a partir da emissão.
    dataInicioViagem: data(ide.dhIniViagem) || dataEmissao,
    placaTracao: texto(tracao.placa),
    placaReboque: texto(lista<any>(rodo.veicReboque)[0]?.placa),
    rntrc: texto(rodo.infANTT?.RNTRC),
    condutorNome: texto(lista<any>(tracao.condutor)[0]?.xNome),
    condutorCpf: texto(lista<any>(tracao.condutor)[0]?.CPF),
    contratanteCnpj: (texto(lista<any>(rodo.infANTT?.infContratante)[0]?.CNPJ) || "").replace(/\D/g, "") || null,
    qtdCTe: parseInt(String(tot.qCTe ?? "0"), 10) || 0,
    qtdNFe: parseInt(String(tot.qNFe ?? "0"), 10) || 0,
    valorCarga: numero(tot.vCarga),
    pesoCarga: numero(tot.qCarga),
    cStat: texto(prot?.cStat),
    documentos,
  };
}
