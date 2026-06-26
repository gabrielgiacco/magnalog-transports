import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";
import type { TipoEventoAuditoria } from "@prisma/client";

interface UserSnapshot {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

interface LogAuditInput {
  tipo: TipoEventoAuditoria;
  user?: UserSnapshot | null;
  sucesso?: boolean;
  recursoTipo?: string;
  recursoId?: string;
  recursoDesc?: string;
  metodo?: string;
  rota?: string;
  ip?: string;
  userAgent?: string;
  detalhes?: Record<string, any> | string;
}

/**
 * Registra um evento na tabela AuditLog. Falha silenciosamente em caso de erro
 * (auditoria não deve quebrar a aplicação).
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const detalhesStr = input.detalhes
      ? typeof input.detalhes === "string"
        ? input.detalhes
        : JSON.stringify(input.detalhes)
      : null;

    await prisma.auditLog.create({
      data: {
        tipo: input.tipo,
        sucesso: input.sucesso ?? true,
        userId: input.user?.id ?? null,
        userEmail: input.user?.email ?? null,
        userName: input.user?.name ?? null,
        userRole: input.user?.role ?? null,
        recursoTipo: input.recursoTipo ?? null,
        recursoId: input.recursoId ?? null,
        recursoDesc: input.recursoDesc ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metodo: input.metodo ?? null,
        rota: input.rota ?? null,
        detalhes: detalhesStr,
      },
    });
  } catch (e) {
    console.error("[audit] Falha ao registrar log:", e);
  }
}

/**
 * Extrai IP e User-Agent de um NextRequest.
 */
export function extractRequestMeta(req: NextRequest | Request): { ip: string; userAgent: string } {
  const headers = (req as any).headers;
  const get = (k: string) => (typeof headers?.get === "function" ? headers.get(k) : (headers?.[k] as string) || "");

  const ip =
    get("x-forwarded-for")?.split(",")[0]?.trim() ||
    get("x-real-ip") ||
    get("cf-connecting-ip") ||
    "desconhecido";
  const userAgent = get("user-agent") || "desconhecido";

  return { ip, userAgent };
}

/**
 * Helper conveniente para logar a partir de um request + session.
 */
export async function logFromRequest(
  req: NextRequest | Request,
  tipo: TipoEventoAuditoria,
  opts: Omit<LogAuditInput, "tipo" | "ip" | "userAgent" | "metodo" | "rota"> & { metodo?: string; rota?: string } = {}
): Promise<void> {
  const { ip, userAgent } = extractRequestMeta(req);
  const url = new URL((req as any).url);
  await logAudit({
    tipo,
    ip,
    userAgent,
    metodo: opts.metodo ?? (req as any).method,
    rota: opts.rota ?? url.pathname,
    ...opts,
  });
}

/**
 * Apaga logs antigos (mais que `dias` dias). Roda em rotina ou sob demanda.
 */
export async function cleanupAuditLogs(dias = 90): Promise<number> {
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);
  const result = await prisma.auditLog.deleteMany({
    where: { timestamp: { lt: limite } },
  });
  return result.count;
}
