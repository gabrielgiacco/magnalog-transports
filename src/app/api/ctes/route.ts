import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAcesso() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any).role;
  if (!["ADMIN", "FINANCEIRO", "OPERACIONAL"].includes(role)) {
    return { error: "Acesso negado", status: 403 };
  }
  return { session };
}

// ─── GET: listar CT-e com filtros ───────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const tomadorCnpj = searchParams.get("tomadorCnpj");
  const emitenteCnpj = searchParams.get("emitenteCnpj");
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const semVinculo = searchParams.get("semVinculo") === "true";
  const semFatura = searchParams.get("semFatura") === "true";

  const where: any = {};
  if (tomadorCnpj) where.tomadorCnpj = tomadorCnpj.replace(/\D/g, "");
  if (emitenteCnpj) where.emitenteCnpj = emitenteCnpj.replace(/\D/g, "");
  if (semVinculo) where.notas = { none: {} };
  if (semFatura) where.faturaId = null;
  if (inicio || fim) {
    where.dataEmissao = {};
    if (inicio) where.dataEmissao.gte = new Date(inicio + "T00:00:00.000Z");
    if (fim) where.dataEmissao.lte = new Date(fim + "T23:59:59.999Z");
  }
  if (q) {
    where.OR = [
      { numero: { contains: q } },
      { chaveAcesso: { contains: q } },
      { tomadorNome: { contains: q, mode: "insensitive" } },
      { emitenteNome: { contains: q, mode: "insensitive" } },
    ];
  }

  const [itens, total] = await Promise.all([
    prisma.cTe.findMany({
      where,
      orderBy: { dataEmissao: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        notas: {
          select: {
            id: true,
            numero: true,
            serie: true,
            entregaId: true,
            entrega: { select: { id: true, codigo: true, razaoSocial: true, cidade: true, uf: true } },
          },
        },
        fatura: { select: { id: true, numero: true, status: true } },
      },
    }),
    prisma.cTe.count({ where }),
  ]);

  return NextResponse.json({ itens, total, pages: Math.ceil(total / limit) });
}
