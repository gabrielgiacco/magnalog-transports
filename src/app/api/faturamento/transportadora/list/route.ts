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
    const cnpj = (searchParams.get("transportadoraCnpj") || "").replace(/\D/g, "");
    const where: any = {};
    if (cnpj) where.transportadoraCnpj = cnpj;
    const faturas = await prisma.faturaTransportadora.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, numero: true, transportadoraCnpj: true, transportadoraNome: true,
        dataInicio: true, dataFim: true, valorTotal: true, status: true, createdAt: true,
      },
    });
    return NextResponse.json({ faturas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
