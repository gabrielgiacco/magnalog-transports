import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, parseInt(searchParams.get("limit") || "50"));
    const skip = (page - 1) * limit;
    const ordem = (searchParams.get("ordem") || "asc").toLowerCase() === "desc" ? "desc" : "asc";
    const tipo = searchParams.get("tipo") || "";
    const mesInicio = searchParams.get("mesInicio") || ""; // "YYYY-MM"
    const mesFim = searchParams.get("mesFim") || "";

    const where: any = {};
    if (tipo) where.tipo = tipo;

    if (mesInicio || mesFim) {
      where.createdAt = {};
      if (mesInicio) {
        const [y, m] = mesInicio.split("-").map(Number);
        if (y && m) where.createdAt.gte = new Date(Date.UTC(y, m - 1, 1));
      }
      if (mesFim) {
        const [y, m] = mesFim.split("-").map(Number);
        if (y && m) where.createdAt.lt = new Date(Date.UTC(y, m, 1)); // exclusivo (início do mês seguinte)
      }
    }

    const [canhotos, total, aggFiltro] = await Promise.all([
      prisma.anexoEntrega.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: ordem },
        include: {
          entrega: { select: { id: true, codigo: true, razaoSocial: true, cidade: true, uf: true } },
          uploadadoPor: { select: { id: true, name: true } },
        },
      }),
      prisma.anexoEntrega.count({ where }),
      prisma.anexoEntrega.aggregate({ where, _sum: { size: true } }),
    ]);

    return NextResponse.json({
      canhotos,
      total,
      pages: Math.ceil(total / limit),
      page,
      limit,
      somaBytesFiltro: aggFiltro._sum.size || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
