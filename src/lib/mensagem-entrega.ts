// Rascunho do aviso de entrega concluída enviado ao cliente.
//
// Função pura de propósito: o texto pode ser conferido sem rede e sem banco, e
// o usuário sempre edita no modal antes de enviar.

import { formatDate } from "@/lib/utils";

export interface DadosAviso {
  codigo: string;
  razaoSocial?: string | null;
  dataEntrega?: Date | string | null;
  notas?: { numero?: string | null }[];
}

/** Corta no limite sem partir palavra no meio. */
function truncar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  const espaco = corte.lastIndexOf(" ");
  return (espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd() + "…";
}

/**
 * Monta o rascunho do aviso. `maxChars` vem da config (600 no plano gratuito).
 */
export function montarAvisoEntrega(dados: DadosAviso, maxChars = 600): string {
  const partes: string[] = ["Olá!"];

  const nf = dados.notas?.map((n) => n.numero).filter(Boolean)[0];
  partes.push(
    nf
      ? `A entrega ${dados.codigo} (NF ${nf}) foi concluída`
      : `A entrega ${dados.codigo} foi concluída`
  );

  if (dados.dataEntrega) partes.push(`em ${formatDate(dados.dataEntrega)}`);

  let texto = partes.join(" ") + ".";
  if (dados.razaoSocial) texto += ` Obrigado pela preferência, ${dados.razaoSocial}!`;
  texto += "\n\n— Magnalog Transportes";

  return truncar(texto, maxChars);
}
