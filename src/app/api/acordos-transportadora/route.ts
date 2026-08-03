import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acordos = await prisma.acordoTransportadora.findMany({ orderBy: { transportadoraNome: "asc" } });
    return NextResponse.json({ acordos });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const body = await req.json();
    const cnpj = String(body.transportadoraCnpj || "").replace(/\D/g, "");
    if (!cnpj || !body.transportadoraNome) {
      return NextResponse.json({ error: "CNPJ e nome obrigatórios" }, { status: 400 });
    }
    const acordo = await prisma.acordoTransportadora.create({
      data: {
        transportadoraCnpj: cnpj,
        transportadoraNome: body.transportadoraNome,
        percentualCTE: Number(body.percentualCTE) || 20,
        taxaEntrega: Number(body.taxaEntrega) || 0,
        valorPaleteFixo: Number(body.valorPaleteFixo) || 0,
        observacoes: body.observacoes || null,
      },
    });
    return NextResponse.json(acordo, { status: 201 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Já existe acordo para este CNPJ" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
