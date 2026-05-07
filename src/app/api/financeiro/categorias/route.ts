import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const categorias = await prisma.categoriaFinanceira.findMany({
    include: {
      subcategorias: true
    },
    orderBy: { nome: "asc" }
  });

  return NextResponse.json(categorias);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { nome, tipo } = body;

  const cat = await prisma.categoriaFinanceira.create({
    data: {
      nome,
      tipo
    }
  });

  return NextResponse.json(cat);
}
