"use client";

import { useState } from "react";
import { Card, Input } from "@/components/ui";
import { MessageSquare, Copy, Check } from "lucide-react";
import { ListaRecebidas, type Recebida } from "./ListaRecebidas";

// Atendimento de ENTRADA pelo WhatsApp: o que chega e o que foi respondido.
//
// A lista de recebidas é a razão desta seção existir. Sem ela, "o cliente
// mandou e não aconteceu nada" só se investiga em log de servidor — e aqui o
// motivo de cada silêncio já vem gravado na própria linha.

interface ConfigAtendimento {
  ativo: boolean;
  atendimentoAtivo: boolean;
  confirmarLocalizacao: boolean;
  maxRespostasDia: number;
}

interface Props {
  config: ConfigAtendimento;
  recebidas: Recebida[];
  isAdmin: boolean;
  salvando: boolean;
  onSalvar: (mudanca: Record<string, unknown>) => void;
}

export function WhatsAppAtendimentoSection({
  config,
  recebidas,
  isAdmin,
  salvando,
  onSalvar,
}: Props) {
  const [copiado, setCopiado] = useState(false);

  const urlWebhook =
    typeof window === "undefined" ? "" : `${window.location.origin}/api/whatsapp/webhook`;

  const copiar = async () => {
    await navigator.clipboard?.writeText(urlWebhook);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Card className="break-inside-avoid mb-5">
      <div
        className="flex items-center gap-3 mb-5"
        style={{ borderBottom: "1px solid var(--border)", paddingBottom: "14px" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(37,211,102,.12)" }}
        >
          <MessageSquare size={16} style={{ color: "#25d366" }} />
        </div>
        <h2 className="text-base font-semibold">Atendimento automático (recebimento)</h2>
      </div>

      <div className="space-y-4">
        {/* O estado, em uma frase */}
        <div
          className="p-3 rounded-xl"
          style={{
            background: config.atendimentoAtivo ? "rgba(37,211,102,.08)" : "rgba(148,163,184,.08)",
            border: `1px solid ${config.atendimentoAtivo ? "rgba(37,211,102,.25)" : "var(--border)"}`,
          }}
        >
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            {config.atendimentoAtivo ? (
              <>
                <strong>Ligado.</strong> Quem mandar o número de uma nota fiscal recebe o status da
                entrega, se o número estiver cadastrado. Cada resposta consome uma da cota.
              </>
            ) : (
              <>
                <strong>Desligado.</strong> As mensagens que chegam ficam registradas aqui embaixo e
                ninguém recebe resposta. É o modo de ver o que a operação manda sem gastar cota.
              </>
            )}
          </p>
        </div>

        {/* URL do webhook */}
        <div>
          <div
            className="text-[10px] uppercase tracking-widest font-mono mb-1.5"
            style={{ color: "var(--text3)" }}
          >
            URL do webhook — cadastre na Pingo
          </div>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 text-xs px-2.5 py-2 rounded-lg truncate"
              style={{ background: "var(--surface2)" }}
              title={urlWebhook}
            >
              {urlWebhook}
            </code>
            <button
              type="button"
              onClick={copiar}
              className="p-2 rounded-lg flex-shrink-0"
              style={{ background: "var(--surface2)" }}
              title="Copiar"
            >
              {copiado ? <Check size={14} style={{ color: "#25d366" }} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-xs mt-1.5" style={{ color: "var(--text3)" }}>
            Evento <strong>Mensagem Recebida</strong>, com assinatura HMAC ligada. O segredo vai na
            variável <code>PINGO_WEBHOOK_SECRET</code>, nunca aqui.
          </p>
        </div>

        {isAdmin && (
          <>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.atendimentoAtivo}
                disabled={salvando || !config.ativo}
                onChange={(e) => onSalvar({ atendimentoAtivo: e.target.checked })}
                className="mt-0.5 accent-orange-500 w-4 h-4"
              />
              <div>
                <div className="text-sm font-medium">Responder automaticamente</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text3)" }}>
                  {config.ativo
                    ? "O robô para na faixa de reserva — ela é do ADMIN"
                    : "Precisa do envio pelo sistema ligado, na seção acima"}
                </div>
              </div>
            </label>

            <div>
              <Input
                label="Teto de respostas por dia"
                type="number"
                defaultValue={config.maxRespostasDia}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== config.maxRespostasDia) onSalvar({ maxRespostasDia: v });
                }}
              />
              <p className="text-xs mt-1.5" style={{ color: "var(--text3)" }}>
                Em cima do teto mensal, para um dia ruim não consumir o mês. Zero faz o robô parar
                hoje sem desligar nada.
              </p>
            </div>
          </>
        )}

        {/* O que chegou, e o que aconteceu com cada uma */}
        <div>
          <div
            className="text-[10px] uppercase tracking-widest font-mono mb-2"
            style={{ color: "var(--text3)" }}
          >
            Últimas recebidas
          </div>

          <ListaRecebidas recebidas={recebidas} />
        </div>
      </div>
    </Card>
  );
}
