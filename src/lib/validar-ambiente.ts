/**
 * Conferencia dos segredos na subida do servidor.
 *
 * Existe porque um default de segredo e pior do que segredo ausente: com
 * NEXTAUTH_SECRET valendo um valor publico do repositorio, qualquer um assina
 * um JWT de sessao ADMIN e entra como administrador. O erro so aparece quando
 * ja e tarde, entao a checagem tem de ser no boot, alto e claro.
 */

/** Valores que existem para ser trocados — se chegaram ate aqui, ninguem trocou. */
const SEGREDOS_DE_EXEMPLO = [
  "changeme-in-production",
  "your-secret-key-here-generate-with-openssl-rand-base64-32",
];

const COMO_GERAR = "Gere um com: openssl rand -base64 32";

export function validarAmbiente() {
  const segredo = (process.env.NEXTAUTH_SECRET || "").trim();

  if (!segredo) {
    throw new Error(
      `NEXTAUTH_SECRET esta vazio. Sem ele o NextAuth nao consegue assinar a sessao. ${COMO_GERAR}`
    );
  }

  if (SEGREDOS_DE_EXEMPLO.includes(segredo)) {
    throw new Error(
      `NEXTAUTH_SECRET esta com o valor de exemplo ("${segredo}"), que e publico. ` +
        `Com ele qualquer pessoa forja um JWT de sessao ADMIN. ${COMO_GERAR}`
    );
  }

  // 32 bytes em base64 dao 44 caracteres. Abaixo de 32 o segredo e curto
  // demais para o uso, e quase sempre e um placeholder digitado a mao.
  if (segredo.length < 32) {
    throw new Error(
      `NEXTAUTH_SECRET tem ${segredo.length} caracteres, curto demais. ${COMO_GERAR}`
    );
  }
}
