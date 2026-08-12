import { prisma } from "@/lib/prisma";
import type { TipoVeiculo } from "@prisma/client";

export type CalcDescargaInput = {
  cnpj: string | null | undefined;
  quantidadePaletes: number | null | undefined;
  veiculoId: string | null | undefined;
};

export type CalcDescargaResult = {
  valor: number;
  fonte: "POR_PALETE" | "POR_AJUDANTE" | "SEM_TABELA" | "SEM_VALOR";
  detalhe: string;
};

const AJUDANTES_POR_TIPO: Record<TipoVeiculo, number> = {
  UTILITARIO: 1,
  VUC: 1,
  TRES_QUARTOS: 1,
  TOCO: 1,
  TRUCK: 1,
  BITRUCK: 2,
  CARRETA: 2,
};

export async function calcularDescarga(input: CalcDescargaInput): Promise<CalcDescargaResult> {
  const cnpjLimpo = (input.cnpj || "").replace(/\D/g, "");
  if (!cnpjLimpo) return { valor: 0, fonte: "SEM_TABELA", detalhe: "sem CNPJ" };

  const tabela = await prisma.tabelaDescarga.findUnique({ where: { cnpjCliente: cnpjLimpo } });
  if (!tabela) return { valor: 0, fonte: "SEM_TABELA", detalhe: "sem tabela cadastrada" };

  if (tabela.tipo === "POR_PALETE") {
    const paletes = input.quantidadePaletes || 0;
    const valor = paletes * tabela.valorPalete;
    return { valor, fonte: "POR_PALETE", detalhe: `${paletes} paletes × R$ ${tabela.valorPalete.toFixed(2)}` };
  }

  if (tabela.tipo === "POR_AJUDANTE") {
    let ajudantes = 1;
    if (input.veiculoId) {
      const v = await prisma.veiculo.findUnique({ where: { id: input.veiculoId }, select: { tipo: true } });
      if (v) ajudantes = AJUDANTES_POR_TIPO[v.tipo] ?? 1;
    }
    const valor = ajudantes * tabela.valorAjudante;
    return { valor, fonte: "POR_AJUDANTE", detalhe: `${ajudantes} ajudante(s) × R$ ${tabela.valorAjudante.toFixed(2)}` };
  }

  return { valor: 0, fonte: "SEM_VALOR", detalhe: "tabela marcada como sem valor" };
}
