import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { consultarCota, getConfig, competenciaAtual } from "@/lib/whatsapp-cota";
import { enviarTexto, PingoError } from "@/lib/pingo";
import { normalizarTelefoneBR } from "@/lib/telefone";
import { logFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ROLES_PERMITIDAS = ["ADMIN", "OPERACIONAL", "FINANCEIRO"];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  if (!ROLES_PERMITIDAS.includes(user?.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { entregaId, texto, forcarReserva, reenviar } = body;

  if (!entregaId) {
    return NextResponse.json({ error: "entregaId é obrigatório" }, { status: 400 });
  }

  const config = await getConfig();
  if (!config.ativo) {
    return NextResponse.json(
      { error: "WHATSAPP_DESATIVADO", message: "O envio por WhatsApp está desligado. Ative em Configurações." },
      { status: 400 }
    );
  }

  // Cota revalidada no servidor — o que o cliente mandou não vale como prova.
  const cota = await consultarCota();
  if (cota.estado === "esgotada") {
    return NextResponse.json(
      {
        error: "COTA_ESGOTADA",
        message: `Cota de ${cota.cotaMensal} mensagens do mês esgotada. Use o botão "Abrir no WhatsApp".`,
        cota,
      },
      { status: 429 }
    );
  }
  if (cota.estado === "reserva" && !(forcarReserva && user.role === "ADMIN")) {
    return NextResponse.json(
      {
        error: "COTA_EM_RESERVA",
        message: `Restam apenas ${cota.restantes} mensagens de reserva. Só um ADMIN pode usá-las.`,
        cota,
      },
      { status: 429 }
    );
  }

  const entrega = await prisma.entrega.findUnique({
    where: { id: entregaId },
    include: { cliente: true },
  });
  if (!entrega) {
    return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  }

  const telefone = normalizarTelefoneBR(entrega.cliente?.telefone);
  if (!telefone) {
    return NextResponse.json(
      {
        error: "TELEFONE_INVALIDO",
        message: entrega.cliente?.telefone
          ? `O telefone "${entrega.cliente.telefone}" não é um número brasileiro válido.`
          : "O cliente desta entrega não tem telefone cadastrado.",
      },
      { status: 400 }
    );
  }

  const mensagem = String(texto || "").trim();
  if (!mensagem) {
    return NextResponse.json({ error: "A mensagem não pode ficar vazia" }, { status: 400 });
  }
  if (mensagem.length > config.maxCaracteres) {
    return NextResponse.json(
      {
        error: "TEXTO_LONGO",
        message: `A mensagem tem ${mensagem.length} caracteres e o limite do plano é ${config.maxCaracteres}.`,
      },
      { status: 400 }
    );
  }

  // Clique duplo aqui custa dinheiro — bloqueia a menos que seja reenvio explícito.
  if (!reenviar) {
    const jaEnviada = await prisma.mensagemWhats.findFirst({
      where: { entregaId, status: "ENVIADA" },
      orderBy: { createdAt: "desc" },
    });
    if (jaEnviada) {
      return NextResponse.json(
        {
          error: "JA_ENVIADO",
          message: `Já foi enviado um aviso desta entrega para ${jaEnviada.destinatario}. Confirme para enviar de novo.`,
        },
        { status: 409 }
      );
    }
  }

  const destinatario = entrega.cliente?.razaoSocial || entrega.razaoSocial || "Cliente";
  const competencia = competenciaAtual();

  try {
    const { providerId } = await enviarTexto(telefone, mensagem);

    const registro = await prisma.mensagemWhats.create({
      data: {
        entregaId,
        telefone,
        destinatario,
        texto: mensagem,
        status: "ENVIADA",
        providerId,
        competencia,
        enviadoPorId: user?.id ?? null,
      },
    });

    await logFromRequest(req, "WHATSAPP_ENVIADO", {
      user,
      recursoTipo: "Entrega",
      recursoId: entregaId,
      recursoDesc: `Aviso de entrega ${entrega.codigo} para ${destinatario}`,
      detalhes: { telefone, caracteres: mensagem.length, usouReserva: cota.estado === "reserva" },
    });

    return NextResponse.json({ ok: true, mensagem: registro, cota: await consultarCota() });
  } catch (e: any) {
    const erro = e instanceof PingoError ? e.message : "Erro inesperado ao enviar a mensagem.";
    const status = e instanceof PingoError ? e.status : 500;

    // O registro é gravado também na falha — o histórico não pode mentir sobre
    // o que foi tentado. FALHOU não consome cota.
    await prisma.mensagemWhats.create({
      data: {
        entregaId,
        telefone,
        destinatario,
        texto: mensagem,
        status: "FALHOU",
        erro,
        competencia,
        enviadoPorId: user?.id ?? null,
      },
    });

    await logFromRequest(req, "WHATSAPP_ENVIADO", {
      user,
      sucesso: false,
      recursoTipo: "Entrega",
      recursoId: entregaId,
      recursoDesc: `Falha no aviso da entrega ${entrega.codigo}`,
      detalhes: { telefone, erro },
    });

    return NextResponse.json({ error: "FALHA_ENVIO", message: erro }, { status });
  }
}
