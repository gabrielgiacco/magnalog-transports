import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any).role;
  if (role !== "ADMIN") return { error: "Apenas ADMIN pode visualizar auditoria", status: 403 };
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const userId = searchParams.get("userId");
  const ip = searchParams.get("ip");
  const q = searchParams.get("q")?.trim();
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.get("limit") || "50")));

  const where: any = {};
  if (tipo) where.tipo = tipo;
  if (userId) where.userId = userId;
  if (ip) where.ip = { contains: ip };
  if (q) {
    where.OR = [
      { userEmail: { contains: q, mode: "insensitive" } },
      { userName: { contains: q, mode: "insensitive" } },
      { recursoDesc: { contains: q, mode: "insensitive" } },
      { detalhes: { contains: q, mode: "insensitive" } },
    ];
  }
  if (inicio || fim) {
    where.timestamp = {};
    if (inicio) where.timestamp.gte = new Date(inicio + "T00:00:00");
    if (fim) where.timestamp.lte = new Date(fim + "T23:59:59");
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // KPIs do período (ou globais se sem filtro de data)
  const wherePeriodo = inicio || fim ? { timestamp: where.timestamp } : {};
  const ultimosDias = new Date();
  ultimosDias.setDate(ultimosDias.getDate() - 7);

  const [totalLogins, totalLoginsFail, totalRastreios, totalPortais, eventosUltimosDias] = await Promise.all([
    prisma.auditLog.count({ where: { ...wherePeriodo, tipo: "LOGIN" } }),
    prisma.auditLog.count({ where: { ...wherePeriodo, tipo: "LOGIN_FAIL" } }),
    prisma.auditLog.count({ where: { ...wherePeriodo, tipo: "RASTREIO_PUBLICO" } }),
    prisma.auditLog.count({ where: { ...wherePeriodo, tipo: { in: ["PORTAL_ACESSO", "PORTAL_BUSCA"] } } }),
    prisma.auditLog.count({ where: { timestamp: { gte: ultimosDias } } }),
  ]);

  return NextResponse.json({
    logs,
    total,
    pages: Math.ceil(total / limit),
    page,
    kpis: {
      totalLogins,
      totalLoginsFail,
      totalRastreios,
      totalPortais,
      eventosUltimos7d: eventosUltimosDias,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const dias = parseInt(searchParams.get("dias") || "90");
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);

  const result = await prisma.auditLog.deleteMany({
    where: { timestamp: { lt: limite } },
  });

  return NextResponse.json({ apagados: result.count, dias });
}
