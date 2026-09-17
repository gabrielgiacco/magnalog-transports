import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

/**
 * Gate unico de autorizacao das rotas de API.
 *
 * Existe porque o `if (!session)` sozinho, repetido por dezenas de handlers,
 * autoriza QUALQUER sessao valida — inclusive a de um CLIENTE externo do
 * portal — a ler dado interno. O middleware so protege pagina; `/api/*` fica
 * por conta do handler. Este helper concentra as quatro perguntas que todo
 * handler interno precisa fazer:
 *
 *   1. tem sessao?           -> 401
 *   2. a conta ainda esta ativa?   -> 401 (desativar tem de fechar a API na hora)
 *   3. a conta foi aprovada?       -> 403
 *   4. o papel pode esta rota?     -> 403
 *
 * O padrao (sem argumento) e o conjunto de papeis INTERNOS, ou seja, nega
 * CLIENTE. Rota que o CLIENTE pode usar mora em /api/portal ou /api/public e
 * nao chama este helper com o padrao.
 */

export type Papel = "ADMIN" | "FINANCEIRO" | "OPERACIONAL" | "CONFERENTE" | "CLIENTE";

/** Todo papel que trabalha dentro da Magnalog. CLIENTE e externo e fica de fora. */
export const PAPEIS_INTERNOS: Papel[] = ["ADMIN", "FINANCEIRO", "OPERACIONAL", "CONFERENTE"];

export type UsuarioApi = {
  id: string;
  email: string;
  nome: string | null;
  role: Papel;
};

/**
 * `session` vem junto porque muito handler usa `session.user` adiante. Assim a
 * migracao nao precisa de um segundo getServerSession — que custaria outra
 * consulta ao banco, ja que o callback `jwt` le o usuario a cada chamada.
 */
type Autorizado = { ok: true; user: UsuarioApi; session: Session };
type Negado = { ok: false; response: NextResponse };
export type ResultadoApi = Autorizado | Negado;

const naoAutorizado = () =>
  NextResponse.json({ error: "Não autorizado" }, { status: 401 });

const acessoNegado = () =>
  NextResponse.json({ error: "Acesso negado" }, { status: 403 });

/**
 * Valida a requisicao e devolve o usuario, ou a resposta de recusa.
 *
 * Uso:
 *   const auth = await requireApi(["ADMIN", "FINANCEIRO"]);
 *   if (!auth.ok) return auth.response;
 *   // auth.user.id, auth.user.role
 *
 * `ativo` e `aprovado` saem do token, que o callback `jwt` reescreve do banco a
 * cada requisicao — entao desativar um usuario vale ja na proxima chamada, sem
 * esperar o JWT expirar e sem consulta extra aqui.
 */
export async function requireApi(papeis: Papel[] = PAPEIS_INTERNOS): Promise<ResultadoApi> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, response: naoAutorizado() };

  const u = session.user as any;

  // Fecha por omissao: token sem o flag e token de usuario apagado do banco
  // caem aqui do mesmo jeito que um usuario desativado.
  if (u.ativo !== true) return { ok: false, response: naoAutorizado() };
  if (u.aprovado !== true) return { ok: false, response: acessoNegado() };

  const role = u.role as Papel;
  if (!papeis.includes(role)) return { ok: false, response: acessoNegado() };

  return {
    ok: true,
    user: { id: u.id, email: u.email, nome: u.name ?? null, role },
    session,
  };
}

/**
 * CNPJs de embarcador que este usuario pode enxergar.
 *
 * So faz sentido para CLIENTE: e o mesmo filtro que /api/portal ja aplica, e e
 * o que falta nas rotas internas por id para elas nao devolverem carga de
 * embarcador que o cliente nao contratou.
 */
export async function cnpjsAutorizados(userId: string): Promise<string[]> {
  const autorizados = await prisma.fornecedorAutorizado.findMany({
    where: { userId },
    select: { cnpjEmitente: true },
  });
  return autorizados.map((a) => a.cnpjEmitente);
}

/**
 * Recusa em bloco: 404, nao 403.
 *
 * Responder 403 a um id que existe e 404 a um que nao existe conta ao cliente
 * quais ids sao reais. Os dois casos saem iguais daqui.
 */
export const naoEncontrado = () =>
  NextResponse.json({ error: "Não encontrado" }, { status: 404 });
