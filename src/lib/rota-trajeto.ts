/**
 * Traçado e quilometragem de uma rota, via OSRM (mesmo ecossistema OSM que o
 * Nominatim já usado na geocodificação — sem chave e sem custo).
 */

/**
 * Depósito da Magna Log: AV. Eurípedes Menezes Qd 08 Lt 02, Aparecida de
 * Goiânia - GO. Coordenada obtida uma vez no Nominatim; toda rota sai e
 * volta daqui, então ela entra no cálculo como primeiro e último ponto.
 */
export const DEPOSITO = {
  lat: -16.8176443,
  lng: -49.2147434,
  nome: "Magna Log — Aparecida de Goiânia",
};

export interface Ponto {
  lat: number;
  lng: number;
}

export interface Trajeto {
  distanciaKm: number;
  /** 0 quando não foi possível estimar (traçado aproximado) */
  duracaoHoras: number;
  /** Pares [lat, lng] na ordem do Leaflet, prontos para a Polyline */
  linha: [number, number][];
  /** true = o OSRM não respondeu e o número é distância em linha reta */
  aproximado: boolean;
}

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

/**
 * O servidor público do OSRM responde em ~200ms quente, mas a primeira
 * chamada do dia já levou 13s. O limite é generoso o bastante para não
 * derrubar a tela e ainda cair no cálculo aproximado quando ele está fora.
 */
const TIMEOUT_MS = 15000;

/** Distância em linha reta entre dois pontos, em km. */
export function haversine(a: Ponto, b: Ponto): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Soma dos trechos em linha reta. Usado só quando o OSRM falha — e o
 * resultado é marcado como aproximado, porque estrada real é sempre mais
 * longa que a reta e um número inflado por "fator de correção" chutado
 * daria uma falsa precisão pior que assumir a limitação.
 */
function trajetoAproximado(pontos: Ponto[]): Trajeto {
  let km = 0;
  for (let i = 1; i < pontos.length; i++) km += haversine(pontos[i - 1], pontos[i]);
  return {
    distanciaKm: km,
    duracaoHoras: 0,
    linha: pontos.map((p) => [p.lat, p.lng] as [number, number]),
    aproximado: true,
  };
}

/**
 * Calcula o caminho real por estrada passando pelos pontos na ordem dada.
 * Nunca lança: se o roteador está fora, devolve o traçado aproximado.
 */
export async function calcularTrajeto(pontos: Ponto[]): Promise<Trajeto> {
  if (pontos.length < 2) {
    return { distanciaKm: 0, duracaoHoras: 0, linha: [], aproximado: false };
  }

  // O OSRM espera lng,lat — invertido em relação ao Leaflet. Trocar a ordem
  // aqui devolve uma rota no oceano em vez de um erro, então é um ponto que
  // não pode ser "simplificado" depois.
  const coords = pontos.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM_URL}/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MagnalogTMS/1.0 (gabriel@magnalog.com.br)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) throw new Error(`OSRM ${data.code}`);

    const rota = data.routes[0];
    const linha: [number, number][] = (rota.geometry?.coordinates || []).map(
      ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
    );

    return {
      distanciaKm: rota.distance / 1000,
      duracaoHoras: rota.duration / 3600,
      linha,
      aproximado: false,
    };
  } catch (e: any) {
    console.error("[trajeto] OSRM indisponível, usando linha reta:", e?.message || e);
    return trajetoAproximado(pontos);
  }
}
