import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  const clientes = await prisma.cliente.findMany({
    where: q
      ? {
          OR: [
            { razaoSocial: { contains: q, mode: "insensitive" } },
            { cnpj: { contains: q.replace(/\D/g, "") } },
          ],
        }
      : {},
    orderBy: { razaoSocial: "asc" },
    take: 50,
    include: { _count: { select: { entregas: true } } },
  });

  return NextResponse.json(clientes);
}
