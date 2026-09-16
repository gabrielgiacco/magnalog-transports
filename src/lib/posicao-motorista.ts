/**
 * Leitura da posição e do estado do GPS que o link do motorista manda.
 * Compartilhado entre status, iniciar rota e ocorrência — a regra de
 * validade é uma só e não pode divergir entre elas.
 */

export type Posicao = { latitude: number; longitude: number; precisaoM: number | null };

const GPS_VALIDOS = new Set(["ok", "negado", "indisponivel", "timeout"]);

// Zero é o Golfo da Guiné, não uma entrega — e é o que sai quando o valor vem
// vazio de algum lugar.
export function coordenadaValida(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 || lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Posição do body, ou null se ausente/inválida. Nunca lança: GPS é opcional. */
export function lerPosicao(bruta: unknown): Posicao | null {
  const p = (bruta ?? {}) as Record<string, unknown>;
  const latitude = Number(p.latitude);
  const longitude = Number(p.longitude);
  if (!coordenadaValida(latitude, longitude)) return null;
  const precisao = Number(p.precisaoM);
  return { latitude, longitude, precisaoM: Number.isFinite(precisao) && precisao > 0 ? precisao : null };
}

/** Estado do GPS reportado pelo navegador, com fallback para "indisponivel". */
export function lerGps(bruto: unknown): string {
  const s = String(bruto ?? "");
  return GPS_VALIDOS.has(s) ? s : "indisponivel";
}
