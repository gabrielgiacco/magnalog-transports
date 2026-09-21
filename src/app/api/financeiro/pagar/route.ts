import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApi(["ADMIN", "FINANCEIRO"]);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo"); // 'MOTORISTA', 'DESCARGA'
    const status = searchParams.get("status"); // 'PENDENTE', 'PAGO'

    const where: any = {};
    if (tipo) where.tipo = tipo;
    if (status) where.status = status;

    const contas = await prisma.contaPagar.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        entrega: {
          select: {
            codigo: true,
            notas: { select: { numero: true } }
          }
        },
        rota: {
          select: { codigo: true }
        }
      }
    });

    return NextResponse.json(contas);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const conta = await prisma.contaPagar.create({
      data: {
        descricao: body.descricao,
        valor: body.valor,
        dataVencimento: body.vencimento ? new Date(body.vencimento) : new Date(),
        tipo: body.tipo, // 'MOTORISTA' | 'DESCARGA'
        entregaId: body.entregaId,
        rotaId: body.rotaId,
        status: "PENDENTE"
      }
    });
    return NextResponse.json(conta, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const conta = await prisma.contaPagar.update({
      where: { id: body.id },
      data: {
        status: body.status,
        dataPagamento: body.status === "PAGO" ? new Date() : null,
        valor: body.valor
      }
    });
    return NextResponse.json(conta);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
