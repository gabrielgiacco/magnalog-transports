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
    const q = searchParams.get("q") || "";

    const where: any = {
      ocorrencias: {
        some: {} // Tem pelo menos uma ocorrência cadastrada
      }
    };

    if (q) {
      const orConditions: any[] = [
        { razaoSocial: { contains: q, mode: "insensitive" } },
        { cidade: { contains: q, mode: "insensitive" } },
        { codigo: { contains: q, mode: "insensitive" } },
        { observacoes: { contains: q, mode: "insensitive" } },
        { motorista: { nome: { contains: q, mode: "insensitive" } } },
        { notas: { some: { numero: { contains: q } } } },
      ];
      
      const digits = q.replace(/\D/g, "");
      if (digits.length > 0) {
        orConditions.push({ cnpj: { contains: digits } });
      }

      where.AND = [
        {
          OR: orConditions
        }
      ];
    }

    const entregas = await prisma.entrega.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        motorista: { select: { id: true, nome: true } },
        veiculo: { select: { id: true, placa: true, tipo: true } },
        notas: { select: { id: true, numero: true, valorNota: true, emitenteRazao: true } },
        ocorrencias: { orderBy: { createdAt: "desc" } },
      }
    });

    return NextResponse.json({ entregas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
