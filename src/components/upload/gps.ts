export type Posicao = { latitude: number; longitude: number; precisaoM?: number };
export type Gps = "ok" | "negado" | "indisponivel" | "timeout";

/**
 * Nunca rejeita: GPS negado ou indisponível não pode impedir o motorista de
 * agir. O resultado vai junto no POST, para a equipe saber por que não há
 * coordenada. Compartilhado por status, iniciar rota e ocorrência.
 */
export function obterPosicao(): Promise<{ posicao?: Posicao; gps: Gps }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve({ gps: "indisponivel" });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        posicao: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, precisaoM: pos.coords.accuracy },
        gps: "ok",
      }),
      (err) => resolve({ gps: err.code === 1 ? "negado" : err.code === 3 ? "timeout" : "indisponivel" }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}
