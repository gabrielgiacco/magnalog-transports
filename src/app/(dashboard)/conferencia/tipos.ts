// Tipos da tela de conferencia (espelham o GET /api/conferencias/[id])
export interface ItemConf {
  id: string;
  entregaId?: string | null;
  nfNumero?: string | number | null;
  codigoProduto?: string | null;
  descricao: string;
  unidade?: string | null;
  ean?: string | null;
  eanUnidade?: string | null;
  qtdConferida: number;
  qtdAvaria: number;
  foraDaCarga?: boolean;
  observacao?: string | null;
  // so vem depois de finalizar
  qtdEsperada?: number;
  resultado?: { situacao: "OK" | "FALTA" | "SOBRA" | "FORA_DA_CARGA"; falta?: number; sobra?: number; avaria?: number };
}

export interface Conferencia {
  id: string;
  status: "EM_ANDAMENTO" | "CONCLUIDA" | "COM_DIVERGENCIA";
  rota: { codigo: string; motorista?: string | null; placa?: string | null };
  entregas: Record<string, string>;
  itens: ItemConf[];
  avariaId?: string | null;
}

export interface Leitura {
  chave: number;
  ok: boolean;
  texto: string;
}

export async function chamar(url: string, metodo: string, corpo?: unknown) {
  const r = await fetch(url, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Erro na requisição");
  return j;
}

/** GTIN com 14 digitos (mesma regra do servidor): EAN-13 com ou sem zero casa igual. */
export function gtin14(codigo: string | null | undefined): string | null {
  const d = String(codigo || "").replace(/\D/g, "");
  if (d.length < 8 || d.length > 14) return null;
  return d.padStart(14, "0");
}

/** Linhas da conferencia que casam com o codigo lido (o produto pode estar em varias NFs). */
export function itensDoCodigo(itens: ItemConf[], codigo: string): ItemConf[] {
  const g = gtin14(codigo);
  if (!g) return [];
  return itens.filter((i) => !i.foraDaCarga && (i.ean === g || i.eanUnidade === g));
}
