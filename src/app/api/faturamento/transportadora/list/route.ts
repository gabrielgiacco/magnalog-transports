import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApi(["ADMIN", "FINANCEIRO"]);
    if (!auth.ok) return auth.response;
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
