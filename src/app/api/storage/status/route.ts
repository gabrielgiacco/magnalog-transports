import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const [aggEntrega, aggPolim] = await Promise.all([
      prisma.anexoEntrega.aggregate({ _sum: { size: true }, _count: true }),
      prisma.anexo.aggregate({ _sum: { size: true }, _count: true }),
    ]);

    const usadoBytes = (aggEntrega._sum.size || 0) + (aggPolim._sum.size || 0);
    const limiteGB = Number(process.env.R2_STORAGE_LIMIT_GB || 10);
    const alertaGB = Number(process.env.R2_ALERT_THRESHOLD_GB || 1);
    const limiteBytes = limiteGB * 1024 ** 3;
    const disponivelBytes = Math.max(0, limiteBytes - usadoBytes);
    const disponivelGB = disponivelBytes / 1024 ** 3;
    const usadoGB = usadoBytes / 1024 ** 3;
    const percentUsado = limiteBytes > 0 ? (usadoBytes / limiteBytes) * 100 : 0;

    return NextResponse.json({
      usadoBytes,
      usadoGB,
      limiteGB,
      disponivelGB,
      disponivelBytes,
      totalCanhotos: aggEntrega._count,
      totalAnexosPolim: aggPolim._count,
      percentUsado,
      alertaGB,
      precisaAlerta: disponivelGB < alertaGB,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
