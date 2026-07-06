// Feature flags do sistema.
// Mantenha esses toggles centralizados: quando quiser reativar um módulo
// que foi desligado, basta trocar para true e todo o UI/gating volta.

/**
 * Módulo de Qualidade Operacional (avaliação por entrega/rota).
 * Desligado a pedido em jul/2026 — código do módulo mantido intacto
 * (páginas, API, componentes) para permitir reativação futura sem retrabalho.
 */
export const QUALIDADE_ENABLED = false;
