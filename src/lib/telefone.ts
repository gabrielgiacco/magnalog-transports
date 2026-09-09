// Normalização de telefone brasileiro para envio de WhatsApp.
//
// Existe porque mandar mensagem para número inválido queima cota (100/mês no
// plano gratuito do Pingo) sem entregar nada. Melhor rejeitar antes de gastar.

/** DDDs válidos no Brasil vão de 11 a 99, mas nem todos existem. */
function dddValido(ddd: string): boolean {
  const n = Number(ddd);
  return n >= 11 && n <= 99;
}

/**
 * Normaliza para o formato E.164 sem "+", que é o que a API do Pingo espera:
 * "5511999998888". Devolve null se o número não for utilizável.
 *
 *   "(11) 99999-9999"  → "5511999998888"
 *   "11 3333-4444"     → "551133334444"  (fixo, aceito — pode ter WhatsApp)
 *   "5511999998888"    → inalterado
 *   "1234"             → null
 */
export function normalizarTelefoneBR(raw: string | null | undefined): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;

  // Já veio com DDI 55: 55 + DDD(2) + número(8 ou 9)
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) {
    return dddValido(d.slice(2, 4)) ? d : null;
  }

  // Sem DDI: DDD(2) + número(8 ou 9)
  if (d.length === 10 || d.length === 11) {
    return dddValido(d.slice(0, 2)) ? "55" + d : null;
  }

  return null;
}

/**
 * Formas equivalentes do mesmo número, para buscar no cadastro.
 *
 * O nono dígito é a armadilha: o WhatsApp entrega números com e sem ele
 * conforme o DDD e a época do cadastro. Um motorista salvo como
 * "62999887766" (11 dígitos) pode chegar como "556299887766" (12), e a busca
 * por igualdade simplesmente não acha — o bot fica mudo e ninguém entende.
 *
 *   "556299887766"  → ["556299887766", "5562999887766"]
 *   "5562999887766" → ["5562999887766", "556299887766"]
 *   "551133334444"  → ["551133334444"]   (fixo: não ganha nono dígito)
 *
 * O nono dígito só é acrescentado quando o número local começa em 6-9, que é a
 * faixa de celular. Fixo começa em 2-5, e inventar um "9" ali produziria um
 * celular que pode ser de outra pessoa — num casamento por telefone que
 * autoriza ver nota fiscal, isso é grave.
 */
export function variantesTelefoneBR(raw: string | null | undefined): string[] {
  const base = normalizarTelefoneBR(raw);
  if (!base) return [];

  const ddd = base.slice(2, 4);
  const local = base.slice(4);
  const variantes = [base];

  if (local.length === 9 && local.startsWith("9")) {
    variantes.push(`55${ddd}${local.slice(1)}`);
  } else if (local.length === 8 && /^[6-9]/.test(local)) {
    variantes.push(`55${ddd}9${local}`);
  }

  // Sem Set: o target de compilação deste projeto não itera Set sem
  // downlevelIteration, e são no máximo dois itens.
  return variantes.filter((v, i) => variantes.indexOf(v) === i);
}

/** Formata para exibição: "(11) 99999-9999". Devolve o original se não reconhecer. */
export function formatarTelefoneBR(raw: string | null | undefined): string {
  const original = String(raw || "");
  const normalizado = normalizarTelefoneBR(original);
  if (!normalizado) return original;

  const local = normalizado.slice(2); // tira o 55
  const ddd = local.slice(0, 2);
  const numero = local.slice(2);

  return numero.length === 9
    ? `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`
    : `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
}

/**
 * Monta o link wa.me. Sem telefone válido devolve o link "escolher contato",
 * que ainda serve — o usuário seleciona o destinatário no próprio WhatsApp.
 */
export function linkWhatsApp(telefone: string | null | undefined, texto: string): string {
  const tel = normalizarTelefoneBR(telefone);
  const msg = encodeURIComponent(texto);
  return tel ? `https://wa.me/${tel}?text=${msg}` : `https://wa.me/?text=${msg}`;
}
