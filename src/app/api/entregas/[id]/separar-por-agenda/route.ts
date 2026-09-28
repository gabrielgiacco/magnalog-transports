import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";
import { parseNFProducts } from "@/lib/nf-produtos";
import { agruparPorAgenda, type GrupoAgenda, type NotaParaAgenda } from "@/lib/agenda-nf";

export const dynamic = "force-dynamic";

type Fica = GrupoAgenda & { recebeAgenda: boolean };

/**
 * Monta o plano de separacao por agenda para uma entrega. Usado tanto pelo
 * GET (preview) quanto pelo POST (execucao) — o POST nunca confia num plano
 * mandado pelo cliente, sempre recalcula aqui.
 */
async function montarPlano(entregaId: string) {
  const entrega = await prisma.entrega.findUnique({
    where: { id: entregaId },
    select: {
      id: true,
      codigo: true,
      cnpj: true,
      razaoSocial: true,
      cidade: true,
      uf: true,
      endereco: true,
      bairro: true,
      cep: true,
      status: true,
      dataChegada: true,
      dataAgendada: true,
      notas: { select: { id: true, numero: true, xmlOriginal: true, pesoBruto: true, volumes: true } },
    },
  });
  if (!entrega) return null;

  const notasParaAgenda: NotaParaAgenda[] = entrega.notas.map((nf) => ({
    id: nf.id,
    numero: nf.numero,
    infAdicionais: parseNFProducts(nf.xmlOriginal).infAdicionais,
    pesoBruto: nf.pesoBruto,
    volumes: nf.volumes,
  }));

  const { grupos, semData } = agruparPorAgenda(notasParaAgenda);

  let motivo: string | null = null;
  let fica: Fica;
  let saem: GrupoAgenda[];

  if (!semData && grupos.length === 0) {
    fica = { data: null, notas: [], m3: 0, pesoTotal: 0, volumeTotal: 0, veiculoSugerido: null, recebeAgenda: false };
    saem = [];
    motivo = "Entrega sem notas fiscais.";
  } else if (semData) {
    fica = { ...semData, recebeAgenda: false };
    saem = grupos;
    if (grupos.length === 0) motivo = "Nenhuma nota traz 'agendamento data:'";
  } else {
    const [primeiro, ...resto] = grupos;
    fica = { ...primeiro, recebeAgenda: primeiro.data != null && !entrega.dataAgendada };
    saem = resto;
    if (resto.length === 0) motivo = "Todas as notas têm a mesma agenda";
  }

  const podeSeparar = saem.length >= 1;
  if (!podeSeparar && !motivo) motivo = "Não é possível separar esta entrega.";

  const agendaAtual = entrega.dataAgendada ? entrega.dataAgendada.toISOString().slice(0, 10) : null;

  return { entrega, podeSeparar, motivo, fica, saem, agendaAtual };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const plano = await montarPlano(params.id);
  if (!plano) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  const { podeSeparar, motivo, fica, saem, agendaAtual } = plano;
  return NextResponse.json({ podeSeparar, motivo, fica, saem, agendaAtual });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const plano = await montarPlano(params.id);
  if (!plano) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  const { entrega, podeSeparar, motivo, fica, saem } = plano;
  if (!podeSeparar) {
    return NextResponse.json({ error: motivo || "Não é possível separar esta entrega." }, { status: 400 });
  }

  const novasEntregas = await prisma.$transaction(async (tx) => {
    const criadas: { id: string; codigo: string; dataAgendada: Date | null }[] = [];

    for (const grupo of saem) {
      const codigo = grupo.notas.map((n) => n.numero).join(" / ");
      const nova = await tx.entrega.create({
        data: {
          codigo,
          cnpj: entrega.cnpj,
          razaoSocial: entrega.razaoSocial,
          cidade: entrega.cidade,
          uf: entrega.uf,
          endereco: entrega.endereco,
          bairro: entrega.bairro,
          cep: entrega.cep,
          status: entrega.status,
          dataChegada: entrega.dataChegada,
          pesoTotal: grupo.pesoTotal,
          volumeTotal: grupo.volumeTotal,
          dataAgendada: grupo.data ? new Date(grupo.data) : null,
        },
      });
      await tx.notaFiscal.updateMany({
        where: { id: { in: grupo.notas.map((n) => n.id) } },
        data: { entregaId: nova.id },
      });
      criadas.push({ id: nova.id, codigo: nova.codigo, dataAgendada: nova.dataAgendada });
    }

    const codigoOriginal = fica.notas.map((n) => n.numero).join(" / ") || entrega.codigo;
    const dataOriginal: { codigo: string; pesoTotal: number; volumeTotal: number; dataAgendada?: Date } = {
      codigo: codigoOriginal,
      pesoTotal: fica.pesoTotal,
      volumeTotal: fica.volumeTotal,
    };
    if (fica.recebeAgenda && fica.data) dataOriginal.dataAgendada = new Date(fica.data);

    await tx.entrega.update({ where: { id: entrega.id }, data: dataOriginal });

    return criadas;
  });

  const sessionUser = session.user as any;
  await logFromRequest(req, "ENTREGA_CRIADA", {
    user: { id: sessionUser?.id, email: sessionUser?.email, name: sessionUser?.name, role: sessionUser?.role },
    recursoTipo: "entrega",
    recursoId: entrega.id,
    recursoDesc: `${entrega.codigo} · ${entrega.razaoSocial}`,
    detalhes: {
      acao: "separar-por-agenda",
      origemEntregaId: entrega.id,
      novas: novasEntregas.length,
      datas: saem.map((g) => g.data),
    },
  });

  return NextResponse.json({ novasEntregas });
}
