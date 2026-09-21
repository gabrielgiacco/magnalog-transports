import { NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const auth = await requireApi(["ADMIN"]);
    if (!auth.ok) return auth.response;
    const session = auth.session;

    const body = await req.json();
    const { 
      entregaId, 
      rotaId, 
      conferenciaCorreta, 
      carregamentoCorreto, 
      houveAvaria, 
      organizacaoGeral, 
      observacoes 
    } = body;

    if (!entregaId && !rotaId) {
      return new NextResponse("ID do Entrega ou Rota é obrigatório", { status: 400 });
    }

    let pontuacao = 0;
    if (conferenciaCorreta) pontuacao += 10;
    if (carregamentoCorreto) pontuacao += 10;
    if (!houveAvaria) pontuacao += 10;
    if (organizacaoGeral) pontuacao += 10;

    const query = {
      where: {
        ...(entregaId ? { entregaId } : { rotaId })
      },
      update: {
        conferenciaCorreta,
        carregamentoCorreto,
        houveAvaria,
        organizacaoGeral,
        observacoes,
        pontuacao,
        adminId: (session.user as any).id,
      },
      create: {
        entregaId,
        rotaId,
        conferenciaCorreta,
        carregamentoCorreto,
        houveAvaria,
        organizacaoGeral,
        observacoes,
        pontuacao,
        adminId: (session.user as any).id,
      }
    };

    const qualidade = await (prisma as any).qualidadeOperacional.upsert(query as any);

    return NextResponse.json(qualidade);
  } catch (error) {
    console.error("[QUALIDADE_POST]", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireApi(["ADMIN"]);
    if (!auth.ok) return auth.response;
    const session = auth.session;

    const { searchParams } = new URL(req.url);
    const entregaId = searchParams.get("entregaId");
    const rotaId = searchParams.get("rotaId");

    if (entregaId) {
      const q = await (prisma as any).qualidadeOperacional.findUnique({
        where: { entregaId }
      });
      return NextResponse.json(q);
    }

    if (rotaId) {
      const q = await (prisma as any).qualidadeOperacional.findUnique({
        where: { rotaId }
      });
      return NextResponse.json(q);
    }

    const qualidades = await (prisma as any).qualidadeOperacional.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        entrega: { select: { codigo: true, razaoSocial: true } },
        rota: { select: { codigo: true } }
      }
    });

    return NextResponse.json(qualidades);
  } catch (error) {
    console.error("[QUALIDADE_GET]", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}
