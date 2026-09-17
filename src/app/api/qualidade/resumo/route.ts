import { NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth } from "date-fns";

export async function GET(req: Request) {
  try {
    const auth = await requireApi(["ADMIN"]);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || new Date().toISOString();
    const startDate = startOfMonth(new Date(month));
    const endDate = endOfMonth(new Date(month));

    const records = await (prisma as any).qualidadeOperacional.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        }
      }
    });

    const totalEvaluated = records.length;
    if (totalEvaluated === 0) {
      return NextResponse.json({
        totalEvaluated: 0,
        averageScore: 0,
        percConferencia: 0,
        percCarregamento: 0,
        percAvaria: 0,
        percOrganizacao: 0,
        classificação: { excelente: 0, bom: 0, critico: 0 }
      });
    }

    const sumScore = records.reduce((acc: number, r: any) => acc + r.pontuacao, 0);
    const avgScore = sumScore / totalEvaluated;

    const countConferencia = records.filter((r: any) => r.conferenciaCorreta).length;
    const countCarregamento = records.filter((r: any) => r.carregamentoCorreto).length;
    const countAvaria = records.filter((r: any) => r.houveAvaria).length;
    const countOrganizacao = records.filter((r: any) => r.organizacaoGeral).length;

    const excelente = records.filter((r: any) => r.pontuacao >= 36).length; // 90% of 40 = 36
    const bom = records.filter((r: any) => r.pontuacao >= 32 && r.pontuacao < 36).length; // 80% of 40 = 32
    const critico = records.filter((r: any) => r.pontuacao < 32).length;

    return NextResponse.json({
      totalEvaluated,
      totalEntregas: records.filter((r: any) => r.entregaId !== null).length,
      totalRotas: records.filter((r: any) => r.rotaId !== null).length,
      averageScore: avgScore,
      averagePerc: (avgScore / 40) * 100,
      percConferencia: (countConferencia / totalEvaluated) * 100,
      percCarregamento: (countCarregamento / totalEvaluated) * 100,
      percAvaria: (countAvaria / totalEvaluated) * 100,
      percOrganizacao: (countOrganizacao / totalEvaluated) * 100,
      classificacao: { excelente, bom, critico }
    });
  } catch (error) {
    console.error("[QUALIDADE_RESUMO_GET]", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}
