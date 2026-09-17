/**
 * Roda uma vez na subida do servidor — nao no build, o que evita depender de
 * a variavel existir no ambiente de build da Vercel.
 */
export async function register() {
  // O runtime edge (middleware) nao carrega as env vars de servidor da mesma
  // forma e nao assina sessao; a conferencia so faz sentido no Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validarAmbiente } = await import("@/lib/validar-ambiente");
  validarAmbiente();
}
