/**
 * Traçado e quilometragem de uma rota, via OSRM (mesmo ecossistema OSM que o
 * Nominatim já usado na geocodificação — sem chave e sem custo).
 */

/**
 * Depósito da Magna Log. Ponto fixo: toda rota sai e volta daqui, então ele
 * entra no cálculo como primeiro e último ponto. Só muda se a empresa mudar
 * de endereço — é o único lugar do sistema a alterar quando isso acontecer.
 *
 * Coordenada conferida por duas fontes independentes que batem em 5 m: o
 * link do Google Maps do local e o Plus Code 5QCP+PQ decodificado.
 */
export const DEPOSITO = {
  lat: -16.8282067,
  lng: -49.2131055,
  nome: "Magna Log — Aparecida de Goiânia",
  endereco: "Avenida Tanner de Melo, Qd 06 Lt 02 — Lot. Real Grandeza",
  cidade: "Aparecida de Goiânia - GO",
  cep: "74988-818",
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
const OSRM_TRIP_URL = "https://router.project-osrm.org/trip/v1/driving";

/**
 * O servidor público do OSRM recusa viagens com mais de 100 coordenadas
 * (max-trip-size). Uma vai para o depósito, sobram 99 paradas.
 */
export const MAX_PARADAS_OTIMIZAR = 99;

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

/** Só os campos do OSRM que o sistema lê; o resto da resposta é ignorado. */
interface OsrmResposta {
  code: string;
  routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[];
  trips?: { distance: number; duration: number }[];
  waypoints?: { waypoint_index: number }[];
}

/**
 * GET no OSRM com o User-Agent que o serviço público pede e o timeout da
 * tela. Lança em qualquer falha — quem chama decide o que fazer sem resposta.
 */
async function osrm(url: string): Promise<OsrmResposta> {
  const res = await fetch(url, {
    headers: { "User-Agent": "MagnalogTMS/1.0 (gabriel@magnalog.com.br)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== "Ok") throw new Error(`OSRM ${data.code}`);
  return data;
}

// O OSRM espera lng,lat — invertido em relação ao Leaflet. Trocar a ordem
// aqui devolve uma rota no oceano em vez de um erro, então é um ponto que
// não pode ser "simplificado" depois.
const coordsOsrm = (pontos: Ponto[]) => pontos.map((p) => `${p.lng},${p.lat}`).join(";");

export interface OrdemOtimizada {
  /** Índices das paradas de entrada, na ordem em que o caminhão deve passar */
  ordem: number[];
  distanciaKm: number;
  duracaoHoras: number;
}

/**
 * Reordena as paradas para a rota mais curta saindo do depósito, pelo serviço
 * de viagem do OSRM. Sem retorno ao depósito a rota é aberta e o OSRM escolhe
 * onde terminar (`destination=any`) — conferido contra o servidor real: é
 * aceito e dá a menor distância; só `source=any` junto com `destination=any`
 * é que ele recusa.
 *
 * Devolve null em qualquer falha. Não há "ordem aproximada" de fallback: a
 * ordem que o usuário já tem é melhor que um chute por linha reta.
 */
export async function otimizarOrdem(paradas: Ponto[], retornarDeposito: boolean): Promise<OrdemOtimizada | null> {
  if (paradas.length < 2 || paradas.length > MAX_PARADAS_OTIMIZAR) return null;

  const modo = retornarDeposito
    ? "roundtrip=true&source=first"
    : "roundtrip=false&source=first&destination=any";
  // overview=false: o planejador recalcula o traçado depois com calcularTrajeto.
  const url = `${OSRM_TRIP_URL}/${coordsOsrm([DEPOSITO, ...paradas])}?${modo}&overview=false`;

  try {
    const data = await osrm(url);
    // Mais de uma viagem = coordenadas desconexas; não dá para montar uma rota.
    if (!data.trips || data.trips.length !== 1 || !data.waypoints) throw new Error("OSRM trips != 1");

    // waypoints[i] é a coordenada de entrada i; waypoint_index é a posição dela
    // na viagem. O depósito é a entrada 0 e, por source=first, fica na posição 0.
    const ordem: number[] = new Array(paradas.length);
    for (let i = 1; i < data.waypoints.length; i++) {
      ordem[data.waypoints[i].waypoint_index - 1] = i - 1;
    }

    return {
      ordem,
      distanciaKm: data.trips[0].distance / 1000,
      duracaoHoras: data.trips[0].duration / 3600,
    };
  } catch (e) {
    console.error("[trajeto] OSRM trip indisponível, ordem mantida:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Calcula o caminho real por estrada passando pelos pontos na ordem dada.
 * Nunca lança: se o roteador está fora, devolve o traçado aproximado.
 */
export async function calcularTrajeto(pontos: Ponto[]): Promise<Trajeto> {
  if (pontos.length < 2) {
    return { distanciaKm: 0, duracaoHoras: 0, linha: [], aproximado: false };
  }

  const url = `${OSRM_URL}/${coordsOsrm(pontos)}?overview=full&geometries=geojson`;

  try {
    const data = await osrm(url);
    if (!data.routes?.[0]) throw new Error("OSRM sem rota");

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
