import { prisma } from "@/lib/prisma";

// Limite por tentativa de login. Guardado no AuditLog em vez de memória porque
// na Vercel cada requisição pode cair numa instância diferente — contador em
// memória não sobreviveria e daria falsa sensação de proteção.

const JANELA_MINUTOS = 15;
const MAX_FALHAS_POR_EMAIL = 5;
const MAX_FALHAS_POR_IP = 20; // mais folgado: escritório inteiro sai de um IP só

export type ResultadoLimite = { bloqueado: boolean; motivo?: string; falhas?: number };

export function extrairIp(headers: Record<string, any> | undefined): string {
  const get = (k: string) => {
    const v = headers?.[k] ?? headers?.[k.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  return (
    String(get("x-forwarded-for") || "").split(",")[0]?.trim() ||
    String(get("x-real-ip") || "") ||
    String(get("cf-connecting-ip") || "") ||
    ""
  );
}

export async function verificarLimiteLogin(email: string, ip: string): Promise<ResultadoLimite> {
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000);

  // Um login bem-sucedido zera a contagem: quem errou a senha 3x e acertou não
  // pode ficar preso na janela.
  const ultimoSucesso = await prisma.auditLog.findFirst({
    where: { tipo: "LOGIN", userEmail: email, timestamp: { gte: desde } },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  const inicio = ultimoSucesso?.timestamp && ultimoSucesso.timestamp > desde ? ultimoSucesso.timestamp : desde;

  const [falhasEmail, falhasIp] = await Promise.all([
    prisma.auditLog.count({ where: { tipo: "LOGIN_FAIL", userEmail: email, timestamp: { gt: inicio } } }),
    ip
      ? prisma.auditLog.count({ where: { tipo: "LOGIN_FAIL", ip, timestamp: { gte: desde } } })
      : Promise.resolve(0),
  ]);

  if (falhasEmail >= MAX_FALHAS_POR_EMAIL) {
    return { bloqueado: true, motivo: "limite_por_email", falhas: falhasEmail };
  }
  if (falhasIp >= MAX_FALHAS_POR_IP) {
    return { bloqueado: true, motivo: "limite_por_ip", falhas: falhasIp };
  }
  return { bloqueado: false };
}

// Mensagem única, sem revelar se a conta existe.
export const MENSAGEM_BLOQUEIO = `Muitas tentativas de login. Aguarde ${JANELA_MINUTOS} minutos e tente novamente.`;
