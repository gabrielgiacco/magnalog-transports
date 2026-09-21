// Regras de tempo da presenca online. Compartilhadas entre o beacon (cliente),
// a API e o painel da Auditoria — mudar aqui muda nos tres.

/** Intervalo entre sinais enquanto a aba esta visivel. */
export const INTERVALO_SINAL_MS = 60_000;

/** Sinal mais novo que isso = online. */
export const ONLINE_ATE_MS = 2 * 60_000;

/** Sinal mais novo que isso = visita ainda aberta. Entre ONLINE e isto = ausente. */
export const VISITA_ABERTA_ATE_MS = 5 * 60_000;

export type StatusPresenca = "online" | "ausente";

export function statusDoSinal(ultimoSinal: Date | string, agora = Date.now()): StatusPresenca {
  return agora - new Date(ultimoSinal).getTime() < ONLINE_ATE_MS ? "online" : "ausente";
}
