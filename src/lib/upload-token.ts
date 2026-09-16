import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/** 48h a partir da geração — vale para o link da entrega e o da rota. */
export const TOKEN_DURACAO_MS = 48 * 60 * 60 * 1000;

/** 24 bytes aleatórios em base64url: ~32 caracteres, seguro para URL. */
export const gerarToken = () => randomBytes(24).toString("base64url");

export function tokenValido(token: string | null, expira: Date | null): boolean {
  return !!token && !!expira && expira > new Date();
}

/**
 * Resolve o token do link do motorista para a entrega dele.
 *
 * Mora aqui, e não na rota, porque várias rotas usam o mesmo gate: upload,
 * status e ocorrência em /api/public/upload/[token]. Arquivo de rota do Next
 * só pode exportar handlers, então o helper compartilhado precisa de um
 * módulo próprio.
 *
 * Um token aponta para UMA entrega e expira em 48h. Revogar (DELETE no modal)
 * anula o token, então o próximo uso cai no `null` aqui e a página mostra
 * "Link inválido". É o único ponto onde a validade é decidida — nenhum handler
 * pode pular esta função.
 */
export async function validarToken(token: string) {
  if (!token) return null;
  const entrega = await prisma.entrega.findUnique({
    where: { uploadToken: token },
    select: {
      id: true, codigo: true, razaoSocial: true, cidade: true, uf: true,
      dataAgendada: true, uploadTokenExpira: true, statusCanhoto: true,
      status: true, dataEntrega: true,
      notas: { select: { numero: true, emitenteRazao: true } },
      motorista: { select: { id: true, nome: true } },
    },
  });
  if (!entrega) return null;
  if (!tokenValido(token, entrega.uploadTokenExpira)) return null;
  return entrega;
}

export type EntregaDoToken = NonNullable<Awaited<ReturnType<typeof validarToken>>>;

/** Ordem das paradas: a do planejador quando existe, senão por cidade como sempre foi. */
export const ORDEM_PARADAS = [{ ordemRota: { sort: "asc", nulls: "last" } }, { cidade: "asc" }] as const;

/**
 * Resolve o token do link da rota inteira.
 *
 * Devolve só o que a página do motorista precisa: cabeçalho da rota e, de cada
 * parada, endereço, notas, status, flags e o token da própria entrega (para o
 * card abrir a página por entrega). Nada financeiro sai daqui. Rota CANCELADA
 * é tratada como link inválido.
 */
export async function validarTokenRota(token: string) {
  if (!token) return null;
  const rota = await prisma.rota.findUnique({
    where: { uploadToken: token },
    select: {
      id: true, codigo: true, data: true, status: true, uploadTokenExpira: true,
      motorista: { select: { id: true, nome: true } },
      entregas: {
        orderBy: [...ORDEM_PARADAS],
        select: {
          id: true, codigo: true, razaoSocial: true,
          endereco: true, bairro: true, cidade: true, uf: true, cep: true,
          latitude: true, longitude: true, volumeTotal: true, quantidadePaletes: true,
          status: true, dataEntrega: true, uploadToken: true, uploadTokenExpira: true,
          notas: { select: { numero: true, emitenteRazao: true, volumes: true } },
          anexos: { where: { tipo: { in: ["CANHOTO", "CANHOTO_DESCARGA", "ASSINATURA"] } }, select: { tipo: true } },
          ocorrencias: { where: { resolvida: false }, select: { id: true } },
        },
      },
    },
  });
  if (!rota || rota.status === "CANCELADA") return null;
  if (!tokenValido(token, rota.uploadTokenExpira)) return null;
  return rota;
}

export type RotaDoToken = NonNullable<Awaited<ReturnType<typeof validarTokenRota>>>;
export type ParadaDoToken = RotaDoToken["entregas"][number];
