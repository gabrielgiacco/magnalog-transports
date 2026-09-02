import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// CRUD da tabela de valores de ticket por embarcador. ADMIN apenas — quem gera
// o ticket (FINANCEIRO/OPERACIONAL) recebe só os valores já calculados, pela
// rota /api/entregas/[id]/ticket-preview.
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  if ((session.user as any)?.role !== "ADMIN") return { error: "Sem permissão", status: 403 };
  return { session };
}

function num(v: any): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function percentual(v: any): number {
  return Math.min(100, Math.max(0, num(v)));
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tabelas = await prisma.tabelaTicket.findMany({ orderBy: { nomeEmbarcador: "asc" } });
  return NextResponse.json(tabelas);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body.cnpjEmbarcador || !body.nomeEmbarcador) {
    return NextResponse.json({ error: "CNPJ e nome do embarcador são obrigatórios" }, { status: 400 });
  }

  const cnpjLimpo = String(body.cnpjEmbarcador).replace(/\D/g, "");
  if (!cnpjLimpo) return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });

  const dados = {
    nomeEmbarcador: String(body.nomeEmbarcador),
    emailsPara: body.emailsPara || null,
    emailsCopia: body.emailsCopia || null,
    assuntoModelo: body.assuntoModelo || null,
    textoIntro: body.textoIntro || null,
    textoAssinatura: body.textoAssinatura || null,
    valorPalete: num(body.valorPalete),
    diariaVuc: num(body.diariaVuc),
    diariaTresQuartos: num(body.diariaTresQuartos),
    diariaToco: num(body.diariaToco),
    diariaTruck: num(body.diariaTruck),
    diariaCarreta: num(body.diariaCarreta),
    diariaBitruck: num(body.diariaBitruck),
    diariaUtilitario: num(body.diariaUtilitario),
    percentualReentrega: percentual(body.percentualReentrega ?? 80),
    aliqIrpj: percentual(body.aliqIrpj ?? 8),
    aliqCsll: percentual(body.aliqCsll ?? 12),
    aliqCofins: percentual(body.aliqCofins ?? 7.6),
    aliqPis: percentual(body.aliqPis ?? 1.65),
    aliqIss: percentual(body.aliqIss ?? 3),
    observacoes: body.observacoes || null,
  };

  const tabela = await prisma.tabelaTicket.upsert({
    where: { cnpjEmbarcador: cnpjLimpo },
    update: dados,
    create: { cnpjEmbarcador: cnpjLimpo, ...dados },
  });

  return NextResponse.json(tabela, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.tabelaTicket.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
