// Motor de casamento entre linha de extrato e lançamento do TMS.
//
// Pontua candidatos e devolve o MOTIVO em texto. O motivo é parte do produto:
// sem ele o usuário não tem como julgar a sugestão, e a tela vira aposta.
//
// Nunca decide sozinho — quem confirma é o usuário. Marcar lançamento como
// pago mexe no caixa e no DRE; errar em silêncio é pior que pedir um clique.

export interface LinhaExtrato {
  data: Date;
  valor: number; // negativo = saída
  descricao: string;
  documento: string | null;
}

export interface LancamentoCandidato {
  id: string;
  descricao: string;
  valor: number;
  tipo: "RECEITA" | "DESPESA";
  dataVencimento: Date;
  dataPagamento: Date | null;
  favorecido: string | null;
  /** CPF do motorista cujo nome bate com o favorecido, quando existir. */
  documentoFavorecido?: string | null;
}

export interface Sugestao {
  lancamento: LancamentoCandidato;
  pontos: number;
  motivos: string[];
}

const JANELA_DIAS = 3;
const TOLERANCIA_CENTAVOS = 0.05;

/** Remove acento, pontuação e caixa — para comparar nome de gente. */
export function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const soDigitos = (t: string | null | undefined) => (t || "").replace(/\D/g, "");

function diffDias(a: Date, b: Date): number {
  return Math.abs(Math.floor((a.getTime() - b.getTime()) / 86_400_000));
}

/** Códigos de rota tipo RTA-0216, que aparecem na descrição do lançamento. */
function codigosRota(texto: string): string[] {
  return (texto.match(/RTA[-\s]?\d+/gi) || []).map((c) => c.toUpperCase().replace(/\s/g, "-"));
}

/**
 * Um nome de pessoa costuma vir truncado no extrato ("Gildemar Pereira De S").
 * Por isso comparamos por partes significativas, não por igualdade.
 */
function nomeBate(favorecido: string, descricao: string): boolean {
  const partes = normalizar(favorecido).split(" ").filter((p) => p.length >= 4);
  if (partes.length === 0) return false;
  const desc = normalizar(descricao);
  const acertos = partes.filter((p) => desc.includes(p)).length;
  // Duas partes (nome + sobrenome) ou o nome inteiro quando só há uma parte.
  return acertos >= Math.min(2, partes.length);
}

export function pontuar(linha: LinhaExtrato, lanc: LancamentoCandidato): Sugestao | null {
  const motivos: string[] = [];
  let pontos = 0;

  // Sentido tem que bater: saída paga despesa, entrada paga receita.
  const saida = linha.valor < 0;
  if (saida && lanc.tipo !== "DESPESA") return null;
  if (!saida && lanc.tipo !== "RECEITA") return null;

  // ── Valor ──────────────────────────────────────────────────────────────
  const absLinha = Math.abs(linha.valor);
  const diffValor = Math.abs(absLinha - lanc.valor);
  if (diffValor < 0.005) {
    pontos += 50;
    motivos.push("valor exato");
  } else if (diffValor <= TOLERANCIA_CENTAVOS) {
    pontos += 30;
    motivos.push("valor com diferença de centavos");
  } else {
    // Sem valor próximo não há casamento plausível.
    return null;
  }

  // ── Data ───────────────────────────────────────────────────────────────
  const referencia = lanc.dataPagamento || lanc.dataVencimento;
  const dias = diffDias(linha.data, referencia);
  if (dias === 0) {
    pontos += 25;
    motivos.push("mesma data");
  } else if (dias <= JANELA_DIAS) {
    pontos += 15;
    motivos.push(`${dias} dia${dias > 1 ? "s" : ""} de diferença`);
  } else if (dias <= 15) {
    pontos += 3;
    motivos.push(`${dias} dias de diferença`);
  }

  // ── Documento ──────────────────────────────────────────────────────────
  const docLinha = soDigitos(linha.documento);
  const docFav = soDigitos(lanc.documentoFavorecido);
  if (docLinha && docFav && docLinha === docFav) {
    pontos += 40;
    motivos.push("CPF/CNPJ do favorecido bate");
  }

  // ── Favorecido ─────────────────────────────────────────────────────────
  if (lanc.favorecido && nomeBate(lanc.favorecido, linha.descricao)) {
    pontos += 25;
    motivos.push("favorecido aparece na descrição");
  }

  // ── Código de rota ─────────────────────────────────────────────────────
  const rotasLanc = codigosRota(lanc.descricao);
  const rotasLinha = codigosRota(linha.descricao);
  if (rotasLanc.length && rotasLinha.some((r) => rotasLanc.includes(r))) {
    pontos += 40;
    motivos.push("código da rota bate");
  }

  return { lancamento: lanc, pontos, motivos };
}

export interface ResultadoCasamento {
  sugestoes: Sugestao[];
  /** true quando a melhor sugestão está isolada o bastante para confiar. */
  confiavel: boolean;
}

export function casar(linha: LinhaExtrato, candidatos: LancamentoCandidato[]): ResultadoCasamento {
  const sugestoes = candidatos
    .map((c) => pontuar(linha, c))
    .filter((s): s is Sugestao => s !== null)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 5);

  // Empate no topo é o caso perigoso: dois pagamentos idênticos no mesmo dia.
  // Aí a sugestão existe, mas não é confiável, e a tela precisa dizer isso.
  const confiavel =
    sugestoes.length > 0 &&
    sugestoes[0].pontos >= 75 &&
    (sugestoes.length === 1 || sugestoes[0].pontos - sugestoes[1].pontos >= 20);

  return { sugestoes, confiavel };
}

export function descreverMotivos(s: Sugestao): string {
  return s.motivos.join(" + ");
}
