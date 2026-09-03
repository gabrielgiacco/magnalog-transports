// Contador da cota mensal de WhatsApp.
//
// A API do Pingo não expõe quantas mensagens restam, então o contador é nosso:
// contamos as MensagemWhats ENVIADA da competência atual. Isso permite bloquear
// ANTES de chamar o provedor, em vez de descobrir no erro.

import { prisma } from "@/lib/prisma";

export type EstadoCota = "ok" | "reserva" | "esgotada";

export interface Cota {
  usadas: number;
  cotaMensal: number;
  limiteReserva: number;
  restantes: number;
  competencia: string;
  estado: EstadoCota;
}

/**
 * Competência ("2026-09") no fuso de Brasília.
 *
 * Não dá para usar a data do servidor direto: a Vercel roda em UTC, e às 22h de
 * 31/08 em Brasília já é 01/09 em UTC — a mensagem cairia no mês seguinte e a
 * cota viraria antes da hora.
 */
export function competenciaAtual(agora: Date = new Date()): string {
  // en-CA formata como "2026-09-02", então basta cortar o dia.
  const dataSP = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return dataSP.slice(0, 7);
}

/** Nome do mês por extenso, para exibição ("setembro de 2026"). */
export function competenciaPorExtenso(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  if (!ano || !mes) return competencia;
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(ano, mes - 1, 1)));
  return `${nome} de ${ano}`;
}

/** Config única, criada na primeira leitura (padrão do PaleteConfig). */
export async function getConfig() {
  return prisma.whatsAppConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

export async function consultarCota(): Promise<Cota> {
  const config = await getConfig();
  const competencia = competenciaAtual();

  // Só o que foi realmente enviado consome cota; tentativas que falharam ficam
  // no log para auditoria mas não contam.
  const usadas = await prisma.mensagemWhats.count({
    where: { competencia, status: "ENVIADA" },
  });

  const estado: EstadoCota =
    usadas >= config.cotaMensal ? "esgotada"
    : usadas >= config.limiteReserva ? "reserva"
    : "ok";

  return {
    usadas,
    cotaMensal: config.cotaMensal,
    limiteReserva: config.limiteReserva,
    restantes: Math.max(0, config.cotaMensal - usadas),
    competencia,
    estado,
  };
}
