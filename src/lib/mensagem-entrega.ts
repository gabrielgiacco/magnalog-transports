// Rascunho do aviso de entrega concluída enviado ao EMBARCADOR (o emitente da
// NF, quem contratou o frete). Ele quer saber que a carga dele chegou e para
// quem — por isso o destinatário aparece no texto, e não como interlocutor.
//
// Função pura de propósito: o texto pode ser conferido sem rede e sem banco, e
// o usuário sempre edita no modal antes de enviar.

import { formatDate } from "@/lib/utils";

export interface DadosAviso {
  codigo: string;
  /** Quem recebeu a carga (destinatário), citado no texto. */
  destinatario?: string | null;
  dataEntrega?: Date | string | null;
  notaNumero?: string | null;
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

  partes.push(
    dados.notaNumero
      ? `A entrega ${dados.codigo} (NF ${dados.notaNumero})`
      : `A entrega ${dados.codigo}`
  );

  if (dados.destinatario) partes.push(`para ${dados.destinatario}`);
  partes.push("foi concluída");
  if (dados.dataEntrega) partes.push(`em ${formatDate(dados.dataEntrega)}`);

  const texto =
    partes.join(" ") + ".\n\nQualquer dúvida, estamos à disposição.\n— Magnalog Transportes";

  return truncar(texto, maxChars);
}
