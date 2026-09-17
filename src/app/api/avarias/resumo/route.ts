import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApi();
    if (!auth.ok) return auth.response;

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const endOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

    const monthFilter = { dataOcorrencia: { gte: startOfMonth, lte: endOfMonth } };

    const [
      totalMes,
      pendentes,
      resolvidas,
      porTipo,
      porFase,
      valorTotal,
      porMotorista,
      totalGeral,
      devolucoesPendentes,
    ] = await Promise.all([
      prisma.avaria.count({ where: monthFilter }),
      prisma.avaria.count({ where: { status: "PENDENTE" } }),
      prisma.avaria.count({ where: { ...monthFilter, status: "RESOLVIDA" } }),
      prisma.avaria.groupBy({ by: ["tipo"], _count: true, where: monthFilter }),
      prisma.avaria.groupBy({ by: ["fase"], _count: true, where: monthFilter }),
      prisma.avaria.aggregate({ _sum: { valorPrejuizo: true }, where: monthFilter }),
      prisma.avaria.groupBy({
        by: ["motoristaId"],
        _count: true,
        where: { ...monthFilter, motoristaId: { not: null } },
        orderBy: { _count: { motoristaId: "desc" } },
        take: 10,
      }),
      prisma.avaria.count(),
      prisma.notaDevolucao.count({ where: { status: "PENDENTE" } }),
    ]);

    // Fetch motorista names
    const motoristaIds = porMotorista.map((m) => m.motoristaId!).filter(Boolean);
    const motoristas = motoristaIds.length > 0
      ? await prisma.motorista.findMany({ where: { id: { in: motoristaIds } }, select: { id: true, nome: true } })
      : [];

    const motoristasMap = Object.fromEntries(motoristas.map((m) => [m.id, m.nome]));

    return NextResponse.json({
      totalMes,
      pendentes,
      resolvidas,
      taxaResolucao: totalMes > 0 ? Math.round((resolvidas / totalMes) * 100) : 0,
      valorTotalPrejuizo: valorTotal._sum.valorPrejuizo || 0,
      porTipo: porTipo.map((t) => ({ tipo: t.tipo, count: t._count })),
      porFase: porFase.map((f) => ({ fase: f.fase, count: f._count })),
      porMotorista: porMotorista.map((m) => ({
        motoristaId: m.motoristaId,
        nome: motoristasMap[m.motoristaId!] || "Desconhecido",
        count: m._count,
      })),
      totalGeral,
      devolucoesPendentes,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
