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
