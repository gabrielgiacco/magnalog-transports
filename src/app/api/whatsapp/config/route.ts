import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { consultarCota, getConfig } from "@/lib/whatsapp-cota";
import { credenciaisConfiguradas } from "@/lib/pingo";

export const dynamic = "force-dynamic";

// Uma chamada só serve o modal de envio e a tela de configurações.
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [config, cota, mensagens] = await Promise.all([
    getConfig(),
    consultarCota(),
    prisma.mensagemWhats.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        destinatario: true,
        telefone: true,
        status: true,
        erro: true,
        createdAt: true,
        entrega: { select: { id: true, codigo: true } },
      },
    }),
  ]);

  return NextResponse.json({
    config,
    cota,
    mensagens,
    credenciaisConfiguradas: credenciaisConfiguradas(),
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();

  const cotaMensal = Math.max(0, Math.floor(Number(body.cotaMensal ?? 100)) || 0);
  // A reserva nunca pode passar da cota, senão nunca haveria estado "reserva".
  const limiteReserva = Math.min(cotaMensal, Math.max(0, Math.floor(Number(body.limiteReserva ?? 90)) || 0));
  const maxCaracteres = Math.max(1, Math.floor(Number(body.maxCaracteres ?? 600)) || 600);

  const dados = {
    ativo: Boolean(body.ativo),
    cotaMensal,
    limiteReserva,
    maxCaracteres,
  };

  const config = await prisma.whatsAppConfig.upsert({
    where: { id: "default" },
    update: dados,
    create: { id: "default", ...dados },
  });

  return NextResponse.json({ config, cota: await consultarCota() });
}
