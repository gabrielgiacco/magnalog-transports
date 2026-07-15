import { prisma } from "@/lib/prisma";
import type { TipoLancamento, OrigemLancamento, FormaPagamento } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════
// Categorias padrão (seed lazy)
// ═══════════════════════════════════════════════════════════════

interface DefaultCategoria {
  nome: string;
  tipo: TipoLancamento;
  ordem: number;
  subcategorias?: string[];
}

const DEFAULT_CATEGORIAS: DefaultCategoria[] = [
  // RECEITAS
  { nome: "Frete", tipo: "RECEITA", ordem: 10, subcategorias: ["Frete Dedicado", "Frete Fracionado", "Reentrega"] },
  { nome: "Armazenagem", tipo: "RECEITA", ordem: 20, subcategorias: ["Armazenagem Mensal", "Movimentação", "Paletização", "Diária"] },
  { nome: "Reembolso de Pedágio", tipo: "RECEITA", ordem: 30 },
  { nome: "Outras Receitas", tipo: "RECEITA", ordem: 99 },

  // DESPESAS
  { nome: "Motoristas", tipo: "DESPESA", ordem: 10, subcategorias: ["Acerto Motorista", "Diária", "Ajuda de Custo"] },
  { nome: "Frota / Terceiros", tipo: "DESPESA", ordem: 15, subcategorias: ["Pagamento Motorista", "Adiantamento Motorista", "Vale / Pedágio", "Descarga (Chapa)"] },
  { nome: "Combustível", tipo: "DESPESA", ordem: 20, subcategorias: ["Diesel", "Gasolina", "Arla 32"] },
  { nome: "Manutenção de Veículos", tipo: "DESPESA", ordem: 30, subcategorias: ["Mecânica", "Elétrica", "Pneus", "Peças", "Revisão"] },
  { nome: "Pedágios", tipo: "DESPESA", ordem: 40 },
  { nome: "Descarga / Chapa", tipo: "DESPESA", ordem: 50 },
  { nome: "Salários e Encargos", tipo: "DESPESA", ordem: 60, subcategorias: ["Folha", "FGTS", "INSS", "Vale Transporte", "Vale Refeição"] },
  { nome: "Aluguel e Condomínio", tipo: "DESPESA", ordem: 70 },
  { nome: "Energia / Água / Internet", tipo: "DESPESA", ordem: 80 },
  { nome: "Impostos e Taxas", tipo: "DESPESA", ordem: 90, subcategorias: ["ICMS", "ISS", "Simples Nacional", "IPVA", "Licenciamento"] },
  { nome: "Material de Escritório", tipo: "DESPESA", ordem: 100 },
  { nome: "Tarifas Bancárias", tipo: "DESPESA", ordem: 110 },
  { nome: "Marketing", tipo: "DESPESA", ordem: 120 },
  { nome: "Outras Despesas", tipo: "DESPESA", ordem: 999 },
];

/**
 * Cria categorias padrão se a tabela estiver vazia. Idempotente — pode ser chamado
 * múltiplas vezes sem duplicar. Marca como `sistema: true` para evitar exclusão.
 */
export async function ensureCategoriasFinanceiras() {
  const count = await prisma.categoriaFinanceira.count();
  if (count > 0) return;

  for (const def of DEFAULT_CATEGORIAS) {
    const cat = await prisma.categoriaFinanceira.upsert({
      where: { nome_tipo: { nome: def.nome, tipo: def.tipo } },
      update: {},
      create: {
        nome: def.nome,
        tipo: def.tipo,
        ordem: def.ordem,
        sistema: true,
        ativo: true,
      },
    });
    if (def.subcategorias?.length) {
      for (const subNome of def.subcategorias) {
        await prisma.subcategoriaFinanceira.upsert({
          where: { categoriaId_nome: { categoriaId: cat.id, nome: subNome } },
          update: {},
          create: { categoriaId: cat.id, nome: subNome, ativo: true },
        });
      }
    }
  }
}

/**
 * Busca uma categoria pelo nome+tipo. Se não existir, cria como categoria do sistema.
 * Útil para origens automáticas (Fatura paga, Acerto pago etc.).
 */
export async function getOrCreateCategoria(nome: string, tipo: TipoLancamento) {
  return prisma.categoriaFinanceira.upsert({
    where: { nome_tipo: { nome, tipo } },
    update: {},
    create: { nome, tipo, ativo: true, sistema: true, ordem: 999 },
  });
}

/**
 * Garante que uma subcategoria existe dentro de uma categoria (upsert idempotente).
 * Usado por origens novas (ex: Diária) que dependem de subcategorias adicionadas
 * depois do seed inicial. Cria a categoria pai se não existir.
 */
export async function ensureSubcategoria(categoriaNome: string, tipo: TipoLancamento, subNome: string) {
  const categoria = await getOrCreateCategoria(categoriaNome, tipo);
  return prisma.subcategoriaFinanceira.upsert({
    where: { categoriaId_nome: { categoriaId: categoria.id, nome: subNome } },
    update: {},
    create: { categoriaId: categoria.id, nome: subNome, ativo: true },
  });
}

// ═══════════════════════════════════════════════════════════════
// Lançamentos automáticos idempotentes
// ═══════════════════════════════════════════════════════════════

interface AutoLancamentoInput {
  origem: OrigemLancamento;
  tipo: TipoLancamento;
  descricao: string;
  valor: number;
  dataPagamento: Date;
  categoriaNome: string;
  subcategoriaNome?: string | null;
  formaPagamento?: FormaPagamento | null;
  favorecido?: string | null;
  // chaves de idempotência (use só uma):
  faturaId?: string | null;
  faturaArmazenagemId?: string | null;
  contaPagarId?: string | null;
  entregaId?: string | null;
  rotaId?: string | null;
  diariaId?: string | null;
}

/**
 * Cria ou atualiza um LancamentoFinanceiro vinculado a uma origem automática.
 * Idempotente: se já existir lançamento com a mesma chave de origem (faturaId,
 * contaPagarId etc.) e mesma origem, atualiza ao invés de criar duplicado.
 */
export async function upsertLancamentoAutomatico(input: AutoLancamentoInput) {
  const categoria = await getOrCreateCategoria(input.categoriaNome, input.tipo);
  const subcategoria = input.subcategoriaNome
    ? await ensureSubcategoria(input.categoriaNome, input.tipo, input.subcategoriaNome)
    : null;

  // monta filtro pra buscar lançamento existente
  const where: any = { origem: input.origem };
  if (input.faturaId) where.faturaId = input.faturaId;
  else if (input.faturaArmazenagemId) where.faturaArmazenagemId = input.faturaArmazenagemId;
  else if (input.contaPagarId) where.contaPagarId = input.contaPagarId;
  else if (input.diariaId) where.diariaId = input.diariaId;
  else if (input.entregaId) where.entregaId = input.entregaId;
  else if (input.rotaId) where.rotaId = input.rotaId;
  else return null; // sem chave de idempotência

  const existente = await prisma.lancamentoFinanceiro.findFirst({ where });

  const data = {
    descricao: input.descricao,
    tipo: input.tipo,
    valor: input.valor,
    dataVencimento: input.dataPagamento,
    dataPagamento: input.dataPagamento,
    status: "PAGO" as const,
    origem: input.origem,
    categoriaId: categoria.id,
    subcategoriaId: subcategoria?.id ?? null,
    formaPagamento: input.formaPagamento ?? null,
    favorecido: input.favorecido ?? null,
    faturaId: input.faturaId ?? null,
    faturaArmazenagemId: input.faturaArmazenagemId ?? null,
    contaPagarId: input.contaPagarId ?? null,
    entregaId: input.entregaId ?? null,
    rotaId: input.rotaId ?? null,
    diariaId: input.diariaId ?? null,
  };

  if (existente) {
    return prisma.lancamentoFinanceiro.update({ where: { id: existente.id }, data });
  }
  return prisma.lancamentoFinanceiro.create({ data });
}

/**
 * Remove o LancamentoFinanceiro vinculado a uma origem automática (ex: ao cancelar
 * uma fatura paga, o lançamento deve sumir).
 */
export async function removeLancamentoAutomatico(
  origem: OrigemLancamento,
  key: { faturaId?: string; faturaArmazenagemId?: string; contaPagarId?: string; entregaId?: string; rotaId?: string; diariaId?: string }
) {
  const where: any = { origem };
  if (key.faturaId) where.faturaId = key.faturaId;
  else if (key.faturaArmazenagemId) where.faturaArmazenagemId = key.faturaArmazenagemId;
  else if (key.contaPagarId) where.contaPagarId = key.contaPagarId;
  else if (key.diariaId) where.diariaId = key.diariaId;
  else if (key.entregaId) where.entregaId = key.entregaId;
  else if (key.rotaId) where.rotaId = key.rotaId;
  else return;

  await prisma.lancamentoFinanceiro.deleteMany({ where });
}

// ═══════════════════════════════════════════════════════════════
// Categoria → tipo de ContaPagar
// ═══════════════════════════════════════════════════════════════

export function categoriaFromTipoConta(tipo: string): string {
  switch (tipo) {
    case "MOTORISTA":
      return "Motoristas";
    case "DESCARGA":
      return "Descarga / Chapa";
    case "ABASTECIMENTO":
      return "Combustível";
    case "PEDAGIO":
      return "Pedágios";
    default:
      return "Outras Despesas";
  }
}

// ═══════════════════════════════════════════════════════════════
// Aging (Contas a Receber / Pagar)
// ═══════════════════════════════════════════════════════════════

export type FaixaAging = "vencido" | "0-30" | "31-60" | "61-90" | "90+";

export function calcAging(dataVencimento: Date, hoje: Date = new Date()): FaixaAging {
  const diff = Math.floor((dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "vencido";
  if (diff <= 30) return "0-30";
  if (diff <= 60) return "31-60";
  if (diff <= 90) return "61-90";
  return "90+";
}

export function diasParaVencer(dataVencimento: Date, hoje: Date = new Date()): number {
  return Math.floor((dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

// ═══════════════════════════════════════════════════════════════
// Período (mês corrente, mês passado etc.)
// ═══════════════════════════════════════════════════════════════

export function inicioMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0));
}

export function fimMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));
}

export function parseMesParam(mesParam?: string | null): { ano: number; mes: number } {
  if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
    const [a, m] = mesParam.split("-").map(Number);
    return { ano: a, mes: m };
  }
  const hoje = new Date();
  return { ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() + 1 };
}
