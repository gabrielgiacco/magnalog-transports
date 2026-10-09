import type { Prisma, StatusEntrega } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseNFProducts, carregarNormasPorDestinatario } from "@/lib/nf-produtos";
import { paletesPorNF } from "@/lib/paletes-por-nf";
import { getCapacidadeVeiculo, TIPO_LABEL } from "@/lib/veiculo-capacidades";

/**
 * Checklist de carregamento do dia — fonte unica da pagina de impressao
 * (/imprimir/checklist-carregamento) e das opcoes de filtro do modal.
 * Entram as cargas agendadas para a data que ainda nao sairam do CD.
 */

export const STATUS_A_CARREGAR: StatusEntrega[] = ["PROGRAMADO", "EM_SEPARACAO", "CARREGADO"];
export const SEM_MOTORISTA = "sem";

export interface FiltrosChecklist {
  data: string; // YYYY-MM-DD
  fornecedores: string[]; // emitenteRazao
  motoristas: string[]; // motoristaId ou SEM_MOTORISTA
  clientes: string[]; // razaoSocial da entrega
  cidades: string[];
}

export type OrigemPaletes = "informado" | "norma" | "parcial" | "sem norma";

export interface CargaChecklist {
  id: string;
  nfs: string[];
  cliente: string;
  cidade: string;
  uf: string;
  fornecedores: string[];
  volumes: number;
  pesoKg: number;
  paletes: number;
  origemPaletes: OrigemPaletes;
  status: StatusEntrega;
  observacoes: string;
}

export interface BlocoVeiculo {
  chave: string;
  motorista: string | null;
  telefone: string | null;
  placa: string | null;
  tipo: string | null;
  capacidadePaletes: number | null;
  cargas: CargaChecklist[];
  paletes: number;
  volumes: number;
  pesoKg: number;
}

/** Hoje no fuso de Goiania (o do CD), como YYYY-MM-DD. */
export const hojeNoCD = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const dataValida = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export function lerFiltrosChecklist(sp: URLSearchParams): FiltrosChecklist {
  const lista = (k: string) => sp.getAll(k).map((v) => v.trim()).filter(Boolean);
  return {
    data: dataValida(sp.get("data")) || hojeNoCD(),
    fornecedores: lista("fornecedor"),
    motoristas: lista("motorista"),
    clientes: lista("cliente"),
    cidades: lista("cidade"),
  };
}

/** dataAgendada fica em meia-noite UTC: o dia e a janela UTC inteira. */
function janelaDoDia(data: string) {
  const [a, m, d] = data.split("-").map(Number);
  return { gte: new Date(Date.UTC(a, m - 1, d)), lte: new Date(Date.UTC(a, m - 1, d, 23, 59, 59, 999)) };
}

function whereDoDia(f: FiltrosChecklist, comFiltros: boolean): Prisma.EntregaWhereInput {
  const and: Prisma.EntregaWhereInput[] = [{ dataAgendada: janelaDoDia(f.data) }, { status: { in: STATUS_A_CARREGAR } }];
  if (!comFiltros) return { AND: and };
  if (f.fornecedores.length) and.push({ notas: { some: { emitenteRazao: { in: f.fornecedores } } } });
  if (f.clientes.length) and.push({ razaoSocial: { in: f.clientes } });
  if (f.cidades.length) and.push({ cidade: { in: f.cidades } });
  if (f.motoristas.length) {
    const ids = f.motoristas.filter((m) => m !== SEM_MOTORISTA);
    const or: Prisma.EntregaWhereInput[] = [];
    if (ids.length) or.push({ motoristaId: { in: ids } });
    if (f.motoristas.includes(SEM_MOTORISTA)) or.push({ motoristaId: null });
    and.push({ OR: or });
  }
  return { AND: and };
}

type Contagem = { valor: string; rotulo: string; total: number };

function contar(itens: { valor: string; rotulo: string }[]): Contagem[] {
  const m = new Map<string, Contagem>();
  for (const i of itens) {
    const c = m.get(i.valor) || { ...i, total: 0 };
    c.total++;
    m.set(i.valor, c);
  }
  return Array.from(m.values()).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Opcoes dos filtros do modal: o que existe nas cargas da data, com contagem. */
export async function opcoesDoDia(data: string) {
  const entregas = await prisma.entrega.findMany({
    where: whereDoDia({ data, fornecedores: [], motoristas: [], clientes: [], cidades: [] }, false),
    select: {
      razaoSocial: true, cidade: true, uf: true,
      motorista: { select: { id: true, nome: true } },
      notas: { select: { emitenteRazao: true } },
    },
  });
  return {
    data,
    cargas: entregas.length,
    fornecedores: contar(entregas.flatMap((e) =>
      Array.from(new Set(e.notas.map((n) => n.emitenteRazao).filter(Boolean))).map((f) => ({ valor: f, rotulo: f }))
    )),
    motoristas: contar(entregas.map((e) =>
      e.motorista ? { valor: e.motorista.id, rotulo: e.motorista.nome } : { valor: SEM_MOTORISTA, rotulo: "Sem motorista" }
    )),
    clientes: contar(entregas.map((e) => ({ valor: e.razaoSocial, rotulo: e.razaoSocial }))),
    cidades: contar(entregas.map((e) => ({ valor: e.cidade, rotulo: `${e.cidade}${e.uf ? ` — ${e.uf}` : ""}` }))),
  };
}

/** Paletes da carga: o informado na entrega vale; sem ele, soma por NF pela norma. */
async function paletesDaCarga(e: {
  cnpj: string;
  quantidadePaletes: number;
  notas: { id: string; numero: string; emitenteCnpj: string; pesoBruto: number; volumes: number; xmlOriginal: string | null }[];
}): Promise<{ paletes: number; origem: OrigemPaletes }> {
  if (e.quantidadePaletes > 0) return { paletes: e.quantidadePaletes, origem: "informado" };
  const normas = await carregarNormasPorDestinatario(e.cnpj, e.notas.map((n) => n.emitenteCnpj));
  const porNF = paletesPorNF(e.notas.map((n) => {
    const fornecedor = String(n.emitenteCnpj || "").replace(/\D/g, "");
    return {
      id: n.id, numero: n.numero, pesoBruto: n.pesoBruto, volumes: n.volumes,
      produtos: parseNFProducts(n.xmlOriginal).produtos.map((p) => ({
        quantidade: p.quantidade,
        norma: normas.get(`${fornecedor}_${p.codigo}`) || null,
      })),
    };
  }));
  const paletes = porNF.reduce((s, n) => s + n.paletes, 0);
  const semNorma = porNF.reduce((s, n) => s + n.itensSemNorma, 0);
  if (semNorma === 0) return { paletes, origem: "norma" };
  return { paletes, origem: paletes > 0 ? "parcial" : "sem norma" };
}

/** Cargas do dia agrupadas por veiculo (placa + motorista); sem veiculo por ultimo. */
export async function montarChecklist(f: FiltrosChecklist): Promise<BlocoVeiculo[]> {
  const entregas = await prisma.entrega.findMany({
    where: whereDoDia(f, true),
    orderBy: [{ razaoSocial: "asc" }],
    select: {
      id: true, cnpj: true, razaoSocial: true, cidade: true, uf: true, status: true,
      observacoes: true, quantidadePaletes: true, pesoTotal: true, volumeTotal: true,
      motorista: { select: { id: true, nome: true, telefone: true } },
      veiculo: { select: { id: true, placa: true, tipo: true, capacidadePaletes: true, capacidadeM3: true } },
      notas: {
        orderBy: { numero: "asc" },
        select: { id: true, numero: true, emitenteCnpj: true, emitenteRazao: true, pesoBruto: true, volumes: true, xmlOriginal: true },
      },
    },
  });

  const blocos = new Map<string, BlocoVeiculo>();
  for (const e of entregas) {
    const chave = `${e.veiculo?.id || "-"}|${e.motorista?.id || "-"}`;
    let bloco = blocos.get(chave);
    if (!bloco) {
      bloco = {
        chave,
        motorista: e.motorista?.nome || null,
        telefone: e.motorista?.telefone || null,
        placa: e.veiculo?.placa || null,
        tipo: e.veiculo ? TIPO_LABEL[e.veiculo.tipo] : null,
        capacidadePaletes: e.veiculo ? getCapacidadeVeiculo(e.veiculo).paletes : null,
        cargas: [], paletes: 0, volumes: 0, pesoKg: 0,
      };
      blocos.set(chave, bloco);
    }
    const { paletes, origem } = await paletesDaCarga(e);
    bloco.cargas.push({
      id: e.id,
      nfs: e.notas.map((n) => n.numero),
      cliente: e.razaoSocial,
      cidade: e.cidade,
      uf: e.uf || "",
      fornecedores: Array.from(new Set(e.notas.map((n) => n.emitenteRazao).filter(Boolean))),
      volumes: e.volumeTotal,
      pesoKg: e.pesoTotal,
      paletes,
      origemPaletes: origem,
      status: e.status,
      observacoes: e.observacoes || "",
    });
    bloco.paletes += paletes;
    bloco.volumes += e.volumeTotal;
    bloco.pesoKg += e.pesoTotal;
  }

  const semVeiculo = (b: BlocoVeiculo) => (b.placa || b.motorista ? 0 : 1);
  return Array.from(blocos.values()).sort((a, b) =>
    semVeiculo(a) - semVeiculo(b) ||
    (a.placa || "zzz").localeCompare(b.placa || "zzz") ||
    (a.motorista || "").localeCompare(b.motorista || "", "pt-BR")
  );
}
