import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { nome, categoriaId } = body;

  const sub = await prisma.subcategoriaFinanceira.create({
    data: {
      nome,
      categoriaId
    }
  });

  return NextResponse.json(sub);
}
