import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCNPJ(cnpj: string): string {
  const n = cnpj.replace(/\D/g, "");
  if (n.length !== 14) return cnpj;
  return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function formatCPF(cpf: string): string {
  const n = cpf.replace(/\D/g, "");
  if (n.length !== 11) return cpf;
  return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(date));
  } catch {
    return "—";
  }
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return "—";
  }
}

export function formatWeight(kg: number): string {
  if (!kg) return "0 kg";
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(2).replace(".", ",")} t`;
  }
  return `${kg.toFixed(0)} kg`;
}

export function generateCodigoEntrega(seq: number): string {
  return `ENT-${String(seq).padStart(5, "0")}`;
}

export function generateCodigoRota(seq: number): string {
  return `RTA-${String(seq).padStart(4, "0")}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export const STATUS_LABELS: Record<string, string> = {
  PROGRAMADO: "Programado",
  EM_SEPARACAO: "Em Separação",
  CARREGADO: "Carregado",
  EM_ROTA: "Em Rota",
  ENTREGUE: "Entregue",
  FINALIZADO: "Finalizado",
  OCORRENCIA: "Ocorrência",
  PLANEJADA: "Planejada",
  EM_ANDAMENTO: "Em Andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const STATUS_COLORS: Record<string, string> = {
  PROGRAMADO: "#f59e0b",
  EM_SEPARACAO: "#3b82f6",
  CARREGADO: "#8b5cf6",
  EM_ROTA: "#6366f1",
  ENTREGUE: "#10b981",
  FINALIZADO: "#64748b",
  OCORRENCIA: "#ef4444",
  PLANEJADA: "#f59e0b",
  EM_ANDAMENTO: "#3b82f6",
  CONCLUIDA: "#10b981",
  CANCELADA: "#ef4444",
};

export const TIPO_VEICULO_LABELS: Record<string, string> = {
  VUC: "VUC",
  TRES_QUARTOS: "3/4",
  TOCO: "Toco",
  TRUCK: "Truck",
  CARRETA: "Carreta",
  BITRUCK: "Bitruck",
  UTILITARIO: "Utilitário",
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  FINANCEIRO: "Financeiro",
  OPERACIONAL: "Operacional",
  CLIENTE: "Cliente",
};
