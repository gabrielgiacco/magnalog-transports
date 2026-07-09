import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { parseNfseXml } from "@/lib/nfse-parser";
import { upsertLancamentoAutomatico } from "@/lib/financeiro";

export const dynamic = "force-dynamic";

async function requireAcesso() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any).role;
  if (!["ADMIN", "FINANCEIRO", "OPERACIONAL"].includes(role)) {
    return { error: "Acesso negado", status: 403 };
  }
  return { session };
}

// ─── GET: listar NFS-e com filtros ─────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const tomadorCnpj = searchParams.get("tomadorCnpj");
  const entregaId = searchParams.get("entregaId");
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const semVinculo = searchParams.get("semVinculo") === "true";

  const where: any = {};
  if (entregaId) where.entregaId = entregaId;
  if (tomadorCnpj) where.tomadorCnpj = tomadorCnpj.replace(/\D/g, "");
  if (semVinculo) where.entregaId = null;
  if (inicio || fim) {
    where.dataEmissao = {};
    if (inicio) where.dataEmissao.gte = new Date(inicio + "T00:00:00.000Z");
    if (fim) where.dataEmissao.lte = new Date(fim + "T23:59:59.999Z");
  }
  if (q) {
    where.OR = [
      { numero: { contains: q } },
      { tomadorRazao: { contains: q, mode: "insensitive" } },
      { discriminacao: { contains: q, mode: "insensitive" } },
      { informacoesAdicionais: { contains: q, mode: "insensitive" } },
    ];
  }

  const [itens, total] = await Promise.all([
    prisma.notaServico.findMany({
      where,
      orderBy: { dataEmissao: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        entrega: { select: { id: true, codigo: true, razaoSocial: true, cidade: true, uf: true } },
        notaFiscal: { select: { id: true, numero: true, serie: true, emitenteRazao: true } },
      },
    }),
    prisma.notaServico.count({ where }),
  ]);

  return NextResponse.json({ itens, total, pages: Math.ceil(total / limit) });
}

// ─── POST: importar XML(s) de NFS-e ────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const results = {
    importadas: 0,
    duplicadas: 0,
    vinculadasAutomaticamente: 0,
    erros: [] as { arquivo: string; erro: string }[],
    novas: [] as any[],
  };

  for (const file of files) {
    try {
      const xml = await file.text();
      const parsed = parseNfseXml(xml);

      if (!parsed.numero || !parsed.prestador.cnpj) {
        results.erros.push({ arquivo: file.name, erro: "XML inválido: número ou prestador ausente" });
        continue;
      }

      // Duplicidade: prestadorCnpj + numero
      const existente = await prisma.notaServico.findUnique({
        where: { prestadorCnpj_numero: { prestadorCnpj: parsed.prestador.cnpj, numero: parsed.numero } },
      });
      if (existente) {
        results.duplicadas++;
        continue;
      }

      // Tentar identificar a entrega pelo número da NF-e referenciado na descrição
      let entregaId: string | null = null;
      let notaFiscalId: string | null = null;
      if (parsed.nfNumeroReferenciado) {
        const nfs = await prisma.notaFiscal.findMany({
          where: {
            numero: parsed.nfNumeroReferenciado,
            entregaId: { not: null },
          },
          take: 5,
          orderBy: { createdAt: "desc" },
          select: { id: true, entregaId: true, destinatarioCnpj: true },
        });
        // Preferência: NF cujo destinatário CNPJ = tomador da NFS-e (mesmo cliente)
        const preferida =
          nfs.find((n) => n.destinatarioCnpj === parsed.tomador.cnpj) ||
          nfs[0];
        if (preferida) {
          notaFiscalId = preferida.id;
          entregaId = preferida.entregaId;
          results.vinculadasAutomaticamente++;
        }
      }

      const nfse = await prisma.notaServico.create({
        data: {
          numero: parsed.numero,
          codigoVerificacao: parsed.codigoVerificacao,
          dataEmissao: parsed.dataEmissao || new Date(),
          valorServicos: parsed.valorServicos,
          valorIss: parsed.valorIss,
          aliquota: parsed.aliquota,
          prestadorCnpj: parsed.prestador.cnpj,
          prestadorRazao: parsed.prestador.razao,
          tomadorCnpj: parsed.tomador.cnpj,
          tomadorRazao: parsed.tomador.razao,
          tomadorMunicipio: parsed.tomador.municipio,
          tomadorUf: parsed.tomador.uf,
          discriminacao: parsed.discriminacao,
          informacoesAdicionais: parsed.informacoesAdicionais,
          entregaId,
          notaFiscalId,
          xmlOriginal: xml,
          arquivoNome: file.name,
        },
        include: {
          entrega: { select: { id: true, codigo: true, razaoSocial: true } },
          notaFiscal: { select: { id: true, numero: true } },
        },
      });

      // Auto-lançamento no Financeiro como RECEITA
      try {
        await upsertLancamentoAutomaticoNfse(nfse.id, parsed);
      } catch (e) {
        // Não falha a importação se o financeiro der problema
        console.error("[NFS-e] Erro ao criar lançamento:", e);
      }

      results.importadas++;
      results.novas.push(nfse);
    } catch (err: any) {
      results.erros.push({ arquivo: file.name, erro: err.message || "Erro ao processar" });
    }
  }

  return NextResponse.json(results);
}

// Helper: cria lançamento financeiro vinculado à NFS-e
async function upsertLancamentoAutomaticoNfse(nfseId: string, parsed: any) {
  const nfse = await prisma.notaServico.findUnique({ where: { id: nfseId } });
  if (!nfse) return;

  // Escolhe categoria por padrão baseada na discriminação
  const disc = (parsed.discriminacao || "") + " " + (parsed.informacoesAdicionais || "");
  let categoriaNome = "Frete"; // fallback receita
  if (/paletiza|armazen/i.test(disc)) categoriaNome = "Armazenagem";
  else if (/transport|frete/i.test(disc)) categoriaNome = "Frete";
  else categoriaNome = "Outras Receitas";

  // Idempotência via notaServicoId — não usamos upsertLancamentoAutomatico do lib
  // porque a chave dele é diferente. Fazemos direto aqui.
  const existente = await prisma.lancamentoFinanceiro.findFirst({
    where: { notaServicoId: nfseId, origem: "NOTA_SERVICO" },
  });

  const { getOrCreateCategoria } = await import("@/lib/financeiro");
  const categoria = await getOrCreateCategoria(categoriaNome, "RECEITA");

  const data = {
    descricao: `NFS-e ${nfse.numero} — ${nfse.tomadorRazao || nfse.tomadorCnpj}`,
    tipo: "RECEITA" as const,
    valor: nfse.valorServicos,
    dataVencimento: nfse.dataEmissao,
    dataPagamento: null,
    status: "PENDENTE" as const,
    origem: "NOTA_SERVICO" as const,
    categoriaId: categoria.id,
    favorecido: nfse.tomadorRazao,
    notaServicoId: nfse.id,
    entregaId: nfse.entregaId,
  };

  if (existente) {
    await prisma.lancamentoFinanceiro.update({ where: { id: existente.id }, data });
  } else {
    await prisma.lancamentoFinanceiro.create({ data });
  }
}
