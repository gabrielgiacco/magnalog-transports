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

  const [config, cota, mensagens, recebidas] = await Promise.all([
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
    // Entrada do atendimento. É aqui que se descobre "por que o Fulano não
    // recebeu resposta": o motivo fica gravado na própria linha.
    prisma.mensagemWhatsRecebida.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        telefone: true,
        nomePerfil: true,
        tipo: true,
        texto: true,
        motivoSemResposta: true,
        createdAt: true,
        resposta: { select: { id: true, status: true, texto: true } },
      },
    }),
  ]);

  return NextResponse.json({
    config,
    cota,
    mensagens,
    recebidas,
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

  // Campo ausente mantém o valor atual, em vez de voltar ao default. A tela
  // manda o config inteiro, mas um chamador que mande só `{ativo: true}`
  // desligaria o atendimento e zeraria a cota sem pedir — e ninguém veria.
  const atual = await getConfig();
  const numero = (v: unknown, padrao: number) =>
    v === undefined || v === null ? padrao : Math.max(0, Math.floor(Number(v)) || 0);
  const booleano = (v: unknown, padrao: boolean) =>
    v === undefined || v === null ? padrao : Boolean(v);

  const cotaMensal = numero(body.cotaMensal, atual.cotaMensal);
  // A reserva nunca pode passar da cota, senão nunca haveria estado "reserva".
  const limiteReserva = Math.min(cotaMensal, numero(body.limiteReserva, atual.limiteReserva));
  const maxCaracteres = Math.max(1, numero(body.maxCaracteres, atual.maxCaracteres));

  const dados = {
    ativo: booleano(body.ativo, atual.ativo),
    cotaMensal,
    limiteReserva,
    maxCaracteres,
    atendimentoAtivo: booleano(body.atendimentoAtivo, atual.atendimentoAtivo),
    confirmarLocalizacao: booleano(body.confirmarLocalizacao, atual.confirmarLocalizacao),
    // Teto diário do robô. Zero é válido e significa "não responde hoje" — é o
    // freio de mão sem precisar desligar o atendimento inteiro.
    maxRespostasDia: numero(body.maxRespostasDia, atual.maxRespostasDia),
  };

  const config = await prisma.whatsAppConfig.upsert({
    where: { id: "default" },
    update: dados,
    create: { id: "default", ...dados },
  });

  return NextResponse.json({ config, cota: await consultarCota() });
}
