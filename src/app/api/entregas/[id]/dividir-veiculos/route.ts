import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";

type GrupoEntrada = { notaIds: string[]; paletes: number };

const erro = (mensagem: string, status = 400) => NextResponse.json({ error: mensagem }, { status });

/** Normaliza o corpo: devolve os grupos limpos ou null se o formato for invalido. */
function lerGrupos(body: any): GrupoEntrada[] | null {
  if (!body || !Array.isArray(body.grupos)) return null;
  const grupos: GrupoEntrada[] = [];
  for (const g of body.grupos) {
    if (!g || !Array.isArray(g.notaIds)) return null;
    const paletes = Math.round(Number(g.paletes));
    grupos.push({
      notaIds: g.notaIds.map((id: unknown) => String(id)),
      paletes: Number.isFinite(paletes) && paletes > 0 ? paletes : 0,
    });
  }
  return grupos;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;
  const session = auth.session;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return erro("Corpo da requisição inválido");
  }
  const grupos = lerGrupos(body);
  if (!grupos) return erro("Informe os grupos de notas por veículo");

  const entrega = await prisma.entrega.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      codigo: true,
      clienteId: true,
      cnpj: true,
      razaoSocial: true,
      cidade: true,
      uf: true,
      endereco: true,
      bairro: true,
      cep: true,
      latitude: true,
      longitude: true,
      status: true,
      dataChegada: true,
      dataAgendada: true,
      notas: { select: { id: true, numero: true, pesoBruto: true, volumes: true } },
    },
  });
  if (!entrega) return erro("Entrega não encontrada", 404);

  if (entrega.status === "ENTREGUE" || entrega.status === "FINALIZADO") {
    return erro("Entrega já concluída não pode ser dividida");
  }
  if (grupos.length < 2) return erro("A divisão precisa de pelo menos 2 veículos");
  if (grupos.some((g) => g.notaIds.length === 0)) return erro("Todo veículo precisa de pelo menos 1 nota");

  // Particao exata: sem nota repetida, faltando ou de outra entrega
  const todos = grupos.flatMap((g) => g.notaIds);
  if (new Set(todos).size !== todos.length) return erro("Há nota repetida em mais de um veículo");
  const idsEntrega = new Set(entrega.notas.map((n) => n.id));
  if (todos.some((id) => !idsEntrega.has(id))) return erro("Há nota que não pertence a esta entrega");
  if (todos.length !== idsEntrega.size) return erro("Todas as notas da entrega precisam estar em algum veículo");

  const notaPorId = new Map(entrega.notas.map((n) => [n.id, n]));
  const resumos = grupos.map((g) => {
    const notas = g.notaIds.map((id) => notaPorId.get(id)!);
    return {
      ids: g.notaIds,
      paletes: g.paletes,
      codigo: notas.map((n) => n.numero).join(" / "),
      pesoTotal: Math.round(notas.reduce((s, n) => s + (n.pesoBruto || 0), 0) * 1000) / 1000,
      volumeTotal: notas.reduce((s, n) => s + (n.volumes || 0), 0),
    };
  });

  const [primeiro, ...resto] = resumos;

  const novasEntregas = await prisma.$transaction(async (tx) => {
    const criadas: { id: string; codigo: string }[] = [];

    for (const r of resto) {
      const nova = await tx.entrega.create({
        data: {
          codigo: r.codigo,
          clienteId: entrega.clienteId,
          cnpj: entrega.cnpj,
          razaoSocial: entrega.razaoSocial,
          cidade: entrega.cidade,
          uf: entrega.uf,
          endereco: entrega.endereco,
          bairro: entrega.bairro,
          cep: entrega.cep,
          latitude: entrega.latitude,
          longitude: entrega.longitude,
          status: entrega.status,
          dataChegada: entrega.dataChegada,
          dataAgendada: entrega.dataAgendada,
          pesoTotal: r.pesoTotal,
          volumeTotal: r.volumeTotal,
          quantidadePaletes: r.paletes,
        },
      });
      await tx.notaFiscal.updateMany({ where: { id: { in: r.ids } }, data: { entregaId: nova.id } });
      criadas.push({ id: nova.id, codigo: nova.codigo });
    }

    // A entrega original fica com o primeiro grupo
    await tx.entrega.update({
      where: { id: entrega.id },
      data: {
        codigo: primeiro.codigo,
        pesoTotal: primeiro.pesoTotal,
        volumeTotal: primeiro.volumeTotal,
        quantidadePaletes: primeiro.paletes,
      },
    });

    return criadas;
  });

  const sessionUser = session.user as any;
  await logFromRequest(req, "ENTREGA_CRIADA", {
    user: { id: sessionUser?.id, email: sessionUser?.email, name: sessionUser?.name, role: sessionUser?.role },
    recursoTipo: "entrega",
    recursoId: entrega.id,
    recursoDesc: `${entrega.codigo} · ${entrega.razaoSocial}`,
    detalhes: {
      acao: "dividir-veiculos",
      origemEntregaId: entrega.id,
      novas: novasEntregas.length,
      paletesPorVeiculo: resumos.map((r) => r.paletes),
    },
  });

  return NextResponse.json({ novasEntregas });
}
