import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { upsertLancamentoAutomatico, removeLancamentoAutomatico } from "@/lib/financeiro";
import { logFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const faturas = await prisma.fatura.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        ctes: { select: { id: true, numero: true, valorReceber: true, dataEmissao: true } },
        _count: { select: { ctes: true } },
      },
    });

    return NextResponse.json(faturas);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const { cnpj, nomeCliente, cteIds, dataVencimento } = body;

    if (!cnpj || !cteIds?.length) {
      return NextResponse.json({ error: "CNPJ e CT-es são obrigatórios" }, { status: 400 });
    }

    // Calcular soma dos CTes selecionados
    const ctes = await prisma.cTe.findMany({ where: { id: { in: cteIds } } });
    const valorFretes = ctes.reduce((sum, cte) => sum + cte.valorReceber, 0);

    // Gerar numero da fatura
    const count = await prisma.fatura.count();
    const numero = `FAT-${String(count + 1).padStart(5, "0")}`;

    const fatura = await prisma.fatura.create({
      data: {
        numero,
        clienteCnpj: cnpj.replace(/\D/g, ""),
        clienteNome: nomeCliente || "Cliente",
        valorFretes,
        valorTotal: valorFretes,
        dataVencimento: dataVencimento ? new Date(dataVencimento) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "ABERTA",
        ctes: { connect: cteIds.map((id: string) => ({ id })) },
      },
      include: {
        ctes: { select: { id: true, numero: true, valorReceber: true } },
        _count: { select: { ctes: true } },
      },
    });

    const user = session.user as any;
    await logFromRequest(req, "FATURA_CRIADA", {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      recursoTipo: "fatura",
      recursoId: fatura.id,
      recursoDesc: `${fatura.numero} · ${fatura.clienteNome}`,
      detalhes: { valor: fatura.valorTotal, ctes: cteIds.length },
    });

    return NextResponse.json(fatura, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const data: any = {};
    if (body.status) data.status = body.status;
    if (body.dataVencimento) data.dataVencimento = new Date(body.dataVencimento);
    if (body.observacoes !== undefined) data.observacoes = body.observacoes;
    if (body.dataPagamento !== undefined) data.observacoes = body.observacoes; // legado

    const fatura = await prisma.fatura.update({
      where: { id: body.id },
      data,
    });

    const user = session.user as any;
    await logFromRequest(req, "FATURA_EDITADA", {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      recursoTipo: "fatura",
      recursoId: fatura.id,
      recursoDesc: `${fatura.numero} · ${fatura.clienteNome}`,
      detalhes: { status: fatura.status, camposAlterados: Object.keys(data) },
    });

    // Sincronização com LancamentoFinanceiro
    if (fatura.status === "PAGA") {
      const dataPagamento = body.dataPagamento ? new Date(body.dataPagamento) : new Date();
      await upsertLancamentoAutomatico({
        origem: "FATURA",
        tipo: "RECEITA",
        descricao: `Fatura ${fatura.numero} · ${fatura.clienteNome}`,
        valor: fatura.valorTotal,
        dataPagamento,
        categoriaNome: "Frete",
        formaPagamento: body.formaPagamento || null,
        favorecido: fatura.clienteNome,
        faturaId: fatura.id,
      });
    } else if (fatura.status === "ABERTA" || fatura.status === "CANCELADA") {
      await removeLancamentoAutomatico("FATURA", { faturaId: fatura.id });
    }

    return NextResponse.json(fatura);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
