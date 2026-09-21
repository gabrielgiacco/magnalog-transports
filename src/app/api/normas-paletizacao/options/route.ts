import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApi();
    if (!auth.ok) return auth.response;

    // Buscar clientes cadastrados
    const clientes = await prisma.cliente.findMany({
      select: {
        cnpj: true,
        razaoSocial: true,
      },
      orderBy: {
        razaoSocial: "asc",
      },
    });

    // Buscar fornecedores distintos das notas fiscais
    const fornecedoresRaw = await prisma.notaFiscal.groupBy({
      by: ["emitenteCnpj", "emitenteRazao"],
      orderBy: {
        emitenteRazao: "asc",
      },
    });

    const fornecedores = fornecedoresRaw.map((f) => ({
      cnpj: f.emitenteCnpj,
      razaoSocial: f.emitenteRazao,
    }));

    return NextResponse.json({ clientes, fornecedores });
  } catch (error) {
    console.error("Erro ao carregar opções para normas:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
