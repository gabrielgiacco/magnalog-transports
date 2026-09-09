// Contrato de provedor de WhatsApp, cobrindo saída E entrada.
//
// Existe para que trocar a Pingo pela Cloud API da Meta seja variável de
// ambiente, e não caçada por `import` espalhada pelo código. Nenhum arquivo de
// negócio conhece o provedor: todos falam com esta interface.

export type TipoEntrada = "TEXTO" | "LOCALIZACAO" | "OUTRO";

export interface MensagemEntrada {
  /** Id da mensagem no provedor. É a chave de deduplicação. */
  providerId: string;
  /** E.164 sem "+". Vazio quando o provedor não entrega o número. */
  telefone: string;
  /** Nome do perfil do WhatsApp, quando vem. */
  nomePerfil: string | null;
  tipo: TipoEntrada;
  texto: string | null;
  /**
   * Coordenadas. Ficam nulas mesmo em mensagem de localização quando o
   * provedor não entrega o conteúdo — medido na Pingo, plano gratuito.
   */
  latitude: number | null;
  longitude: number | null;
  /** Localização em tempo real, que atualiza sozinha, e não um pino fixo. */
  aoVivo: boolean;
  recebidaEm: Date;
}

export interface ResultadoAssinatura {
  ok: boolean;
  motivo?: string;
  /** false quando não havia segredo configurado e o modo espelho deixou passar. */
  conferida: boolean;
  /** Qual convenção fechou, para depois apertar o código na certa. */
  convencao?: "corpo" | "timestamp.corpo";
}

export interface ProvedorWhats {
  readonly nome: "PINGO" | "META";

  // ── saída ──
  enviarTexto(to: string, text: string, timeoutMs?: number): Promise<{ providerId: string | null }>;
  credenciaisConfiguradas(): boolean;

  // ── entrada ──
  verificarAssinatura(raw: string, headers: Headers): ResultadoAssinatura;
  /**
   * Devolve ARRAY porque a Cloud API entrega N mensagens num POST só. A Pingo
   * hoje manda uma, mas o contrato precisa ser o mesmo dos dois lados, senão o
   * adaptador da Meta vira remendo.
   *
   * Mensagem que não deve ser processada — enviada por nós, de grupo, de
   * status — é descartada aqui, na origem.
   */
  parseEntrada(payload: unknown): MensagemEntrada[];
}
