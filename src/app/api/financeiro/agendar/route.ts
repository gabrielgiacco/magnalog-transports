import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  if (!["ADMIN", "FINANCEIRO"].includes(user.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  try {
    const { items, dataPagamentoSaldo } = await req.json();

    if (!Array.isArray(items) || items.length === 0 || dataPagamentoSaldo === undefined) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }

    const dateStr = dataPagamentoSaldo ? new Date(dataPagamentoSaldo) : null;

    const rotasIds = items.filter((i: any) => i.isRota).map((i: any) => i.id);
    const entregasIds = items.filter((i: any) => !i.isRota).map((i: any) => i.id);

    let updatedCount = 0;

    if (rotasIds.length > 0) {
      const res = await prisma.rota.updateMany({
        where: { id: { in: rotasIds } },
        data: { dataPagamentoSaldo: dateStr }
      });
      updatedCount += res.count;
    }

    if (entregasIds.length > 0) {
      const res = await prisma.entrega.updateMany({
        where: { id: { in: entregasIds } },
        data: { dataPagamentoSaldo: dateStr }
      });
      updatedCount += res.count;
    }

    // TODO: Ideally we should sync with ERP (LancamentoFinanceiro) here if needed, 
    // but the system seems to do it only when the actual values change.
    // Setting `dataPagamentoSaldo` doesn't change `status` to 'PAGO' unless the value is saved in the full form.
    // Let's update LancamentoFinanceiro dataVencimento or dataPagamento here?
    // According to existing logic, if it's scheduled, it stays "PENDENTE" with maybe a new dataVencimento?
    // For now, we just set dataPagamentoSaldo so it appears in the Previsões tab.

    return NextResponse.json({ message: "Agendado com sucesso", updatedCount });

  } catch (error) {
    console.error("Erro ao agendar pagamentos:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
