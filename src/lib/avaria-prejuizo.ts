/**
 * Regra do prejuizo de uma avaria com produtos. Puro — usado na API (ao criar)
 * e na tela (total da tabela de produtos).
 *
 * So falta e avaria sao perda. Sobra e mercadoria a mais; na inversao o item
 * trocado volta ao fornecedor; sem pedido e devolucao tambem nao sao perda da
 * transportadora. Excecao: avaria do tipo DEVOLUCAO guarda o valor da
 * mercadoria devolvida, que o Dashboard ja mostra a parte de prejuizo.
 */

export const TIPOS_QUE_SAO_PREJUIZO = ["FALTA", "AVARIA"];

export function linhaContaComoPrejuizo(tipoLinha: string | null | undefined, tipoAvaria: string): boolean {
  if (tipoAvaria === "DEVOLUCAO") return true;
  return TIPOS_QUE_SAO_PREJUIZO.includes(tipoLinha || tipoAvaria);
}

export function calcularPrejuizo(
  tipoAvaria: string,
  produtos: { tipoDivergencia?: string | null; valorTotal?: number | null }[],
): number {
  const total = produtos.reduce(
    (s, p) => s + (linhaContaComoPrejuizo(p.tipoDivergencia, tipoAvaria) ? p.valorTotal || 0 : 0),
    0,
  );
  return Math.round(total * 100) / 100;
}
