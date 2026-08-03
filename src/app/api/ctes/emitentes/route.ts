import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const grupos = await prisma.cTe.groupBy({
      by: ["emitenteCnpj", "emitenteNome"],
      _count: { _all: true },
      orderBy: { _count: { emitenteCnpj: "desc" } },
    });

    const emitentes = grupos.map((g) => ({
      cnpj: g.emitenteCnpj,
      nome: g.emitenteNome,
      totalCTes: g._count._all,
    }));

    return NextResponse.json({ emitentes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
