import type { TipoVeiculo } from "@prisma/client";

export type CapacidadeVeiculo = { paletes: number; m3: number };

const DEFAULTS: Record<TipoVeiculo, CapacidadeVeiculo> = {
  UTILITARIO: { paletes: 2, m3: 4 },
  VUC: { paletes: 4, m3: 12 },
  TRES_QUARTOS: { paletes: 6, m3: 22 },
  TOCO: { paletes: 10, m3: 40 },
  TRUCK: { paletes: 14, m3: 55 },
  BITRUCK: { paletes: 24, m3: 85 },
  CARRETA: { paletes: 28, m3: 100 },
};

export const TIPO_LABEL: Record<TipoVeiculo, string> = {
  UTILITARIO: "Utilitário",
  VUC: "VUC",
  TRES_QUARTOS: "3/4",
  TOCO: "Toco",
  TRUCK: "Truck",
  BITRUCK: "Bitruck / Truck Alongado",
  CARRETA: "Carreta",
};

export function getCapacidadesPadrao(tipo: TipoVeiculo): CapacidadeVeiculo {
  return DEFAULTS[tipo];
}

type VeiculoLike = {
  tipo: TipoVeiculo;
  capacidadePaletes: number | null;
  capacidadeM3: number | null;
};

export function getCapacidadeVeiculo(v: VeiculoLike): {
  paletes: number;
  m3: number;
  origemPaletes: "individual" | "padrao";
  origemM3: "individual" | "padrao";
} {
  const padrao = getCapacidadesPadrao(v.tipo);
  return {
    paletes: v.capacidadePaletes ?? padrao.paletes,
    m3: v.capacidadeM3 ?? padrao.m3,
    origemPaletes: v.capacidadePaletes != null ? "individual" : "padrao",
    origemM3: v.capacidadeM3 != null ? "individual" : "padrao",
  };
}
