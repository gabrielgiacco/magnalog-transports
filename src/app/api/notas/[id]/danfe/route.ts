import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireApi();
    if (!auth.ok) return auth.response;

    const nota = await prisma.notaFiscal.findUnique({
      where: { id: params.id },
      select: { xmlOriginal: true },
    });

    if (!nota || !nota.xmlOriginal) {
      return NextResponse.json({ error: "XML não disponível para esta nota fiscal" }, { status: 404 });
    }

    return NextResponse.json({ xml: nota.xmlOriginal });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
