// Escolha do provedor de WhatsApp.
//
// Trocar a Pingo pela Cloud API da Meta é mudar WHATSAPP_PROVIDER e as
// credenciais — nenhum arquivo de negócio muda, porque ninguém importa o
// provedor direto.

import { PingoAdapter } from "./pingo-adapter";
import type { ProvedorWhats } from "./provider";

const pingo = new PingoAdapter();

export function getProvedor(): ProvedorWhats {
  // O adaptador da Meta entra aqui quando a conta Business existir. Até lá,
  // qualquer valor cai na Pingo — que é o único canal configurado.
  return pingo;
}

export type { MensagemEntrada, ProvedorWhats, TipoEntrada } from "./provider";
