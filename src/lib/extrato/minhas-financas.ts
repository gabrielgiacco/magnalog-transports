// Parser do CSV exportado pelo app Minhas Finanças.
//
// Escrito sobre um export real, não sobre suposição. O que o arquivo de
// verdade mostrou e que não era óbvio:
//
//  1. O VALOR VEM SEMPRE POSITIVO. O sinal está no NOME DO ARQUIVO
//     (despesas-*.csv / receitas-*.csv), porque o app exporta cada tipo
//     separado. Sem isso, toda despesa entraria como receita.
//  2. Encoding Latin-1 / mojibake: cabeçalhos chegam como "DescriÃ§Ã£o".
//     Detectamos e corrigimos, senão nenhuma coluna casa pelo nome.
//  3. Observações podem conter QUEBRA DE LINHA dentro de aspas, então não dá
//     para quebrar o arquivo por \n — precisa de leitura caractere a caractere.
//  4. Não há identificador de transação; o dedupe usa hash do conteúdo.

import { createHash } from "crypto";

export interface TransacaoMinhasFinancas {
  idExterno: string;
  data: Date;
  valor: number; // negativo = saída
  descricao: string;
  documento: string | null;
  conta: string;
  categoria: string | null;
  subcategoria: string | null;
  observacoes: string | null;
}

export interface ExtratoMinhasFinancas {
  transacoes: TransacaoMinhasFinancas[];
  /** Contas distintas encontradas — o CSV mistura várias no mesmo arquivo. */
  contas: string[];
  tipo: "DESPESA" | "RECEITA";
}

/**
 * Corrige texto UTF-8 que foi lido como Latin-1 ("DescriÃ§Ã£o" → "Descrição").
 * Só age quando encontra a assinatura do problema, para não estragar texto bom.
 */
function corrigirMojibake(t: string): string {
  if (!/Ã[-¿©§£º­]/.test(t)) return t;
  try {
    return Buffer.from(t, "latin1").toString("utf8");
  } catch {
    return t;
  }
}

/** CSV com aspas, vírgula dentro de campo e quebra de linha dentro de aspas. */
function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroAspas = false;
      } else campo += c;
      continue;
    }

    if (c === '"') { dentroAspas = true; continue; }
    if (c === ",") { linha.push(campo); campo = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; continue; }
    campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }

  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

/** "285,00" → 285.00 ; "1.234,56" → 1234.56 */
function valorBr(t: string): number {
  const limpo = (t || "").trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isFinite(n) ? Math.abs(n) : 0;
}

/** "31/07/2026" ou "31/07/2026 22:17" */
function dataBr(t: string): Date | null {
  const m = (t || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mes, a, h, min] = m;
  const dt = new Date(Number(a), Number(mes) - 1, Number(d), Number(h || 12), Number(min || 0));
  return isNaN(dt.getTime()) ? null : dt;
}

function extrairDocumento(texto: string): string | null {
  const limpo = texto.replace(/[.\-/]/g, "");
  const m = limpo.match(/\b(\d{14}|\d{11})\b/);
  return m ? m[1] : null;
}

/** Acha a coluna pelo nome, tolerando acento e caixa. */
function indiceColuna(cabecalho: string[], ...nomes: string[]): number {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const alvo = nomes.map(norm);
  return cabecalho.findIndex((c) => alvo.includes(norm(c)));
}

export function ehCsvMinhasFinancas(conteudo: string): boolean {
  const primeira = corrigirMojibake(conteudo.slice(0, 400)).toLowerCase();
  return primeira.includes("descri") && primeira.includes("valor") &&
    (primeira.includes("efetiva") || primeira.includes("vencimento")) && primeira.includes("conta");
}

/**
 * @param nomeArquivo usado para saber se é despesa ou receita — o CSV não diz.
 */
export function parseMinhasFinancas(conteudo: string, nomeArquivo = ""): ExtratoMinhasFinancas {
  const texto = corrigirMojibake(conteudo);
  const linhas = parseCsv(texto);
  if (linhas.length < 2) throw new Error("CSV vazio ou sem linhas de dados.");

  const cab = linhas[0];
  const iDesc = indiceColuna(cab, "descricao");
  const iValor = indiceColuna(cab, "valor");
  const iEfet = indiceColuna(cab, "efetivacao");
  const iVenc = indiceColuna(cab, "vencimento");
  const iLanc = indiceColuna(cab, "lancamento");
  const iCat = indiceColuna(cab, "categoria");
  const iSub = indiceColuna(cab, "subcategoria");
  const iConta = indiceColuna(cab, "conta");
  const iObs = indiceColuna(cab, "observacoes");

  if (iDesc < 0 || iValor < 0 || iConta < 0) {
    throw new Error("CSV não parece do Minhas Finanças: faltam as colunas Descrição, Valor ou Conta.");
  }

  // O app exporta despesas e receitas em arquivos separados, ambos com valor
  // positivo. O nome do arquivo é o único lugar onde o sinal aparece.
  const nome = nomeArquivo.toLowerCase();
  const tipo: "DESPESA" | "RECEITA" = nome.includes("receita") ? "RECEITA" : "DESPESA";
  const sinal = tipo === "DESPESA" ? -1 : 1;

  const transacoes: TransacaoMinhasFinancas[] = [];
  const contas = new Set<string>();

  for (const l of linhas.slice(1)) {
    const descricao = (l[iDesc] || "").trim();
    // Efetivação é quando o dinheiro saiu de fato — é ela que bate com o extrato.
    const data =
      (iEfet >= 0 ? dataBr(l[iEfet]) : null) ||
      (iVenc >= 0 ? dataBr(l[iVenc]) : null) ||
      (iLanc >= 0 ? dataBr(l[iLanc]) : null);
    if (!descricao || !data) continue;

    const valor = valorBr(l[iValor]) * sinal;
    if (valor === 0) continue;

    const conta = (l[iConta] || "").trim() || "Sem conta";
    contas.add(conta);

    const obs = iObs >= 0 ? (l[iObs] || "").trim() : "";

    transacoes.push({
      // Sem identificador no arquivo: hash do que define a transação.
      // Reimportar o mesmo período não duplica; duas transações realmente
      // idênticas no mesmo dia colidem — aceitável, é o mesmo dinheiro.
      idExterno: createHash("sha1")
        .update(`${conta}|${data.toISOString().slice(0, 10)}|${valor}|${descricao}`)
        .digest("hex")
        .slice(0, 32),
      data,
      valor,
      descricao,
      documento: extrairDocumento(descricao),
      conta,
      categoria: iCat >= 0 ? (l[iCat] || "").trim() || null : null,
      subcategoria: iSub >= 0 ? (l[iSub] || "").trim() || null : null,
      observacoes: obs || null,
    });
  }

  return { transacoes, contas: Array.from(contas).sort(), tipo };
}
