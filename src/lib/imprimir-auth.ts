import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";

/**
 * Gate de sessão das páginas de /imprimir.
 *
 * Essas páginas ficam FORA do grupo (dashboard), então não herdam o gate do
 * layout, e por muito tempo também não estavam no matcher do middleware —
 * qualquer pessoa com um id válido renderizava carta-frete, acerto de
 * motorista ou declaração. Este helper é a barreira que fica junto do dado;
 * o matcher do middleware é a segunda camada.
 *
 * `papeis` restringe além do login. Sem ele, basta estar autenticado.
 */
export async function requireSessaoImpressao(papeis?: string[]) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session.user as any)?.role;
  if (papeis && !papeis.includes(role)) redirect("/dashboard");

  return session;
}
