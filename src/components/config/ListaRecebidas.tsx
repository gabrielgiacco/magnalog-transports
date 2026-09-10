"use client";

import { AlertTriangle } from "lucide-react";

// O que chegou pelo WhatsApp e o que aconteceu com cada mensagem.
//
// O motivo do silêncio vem gravado na própria linha, não de log de servidor:
// é a resposta para "por que o Fulano não recebeu nada".

export interface Recebida {
  id: string;
  telefone: string;
  nomePerfil: string | null;
  tipo: string;
  texto: string | null;
  motivoSemResposta: string | null;
  createdAt: string;
  resposta: { id: string; status: string; texto: string } | null;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ListaRecebidas({ recebidas }: { recebidas: Recebida[] }) {
  if (recebidas.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text3)" }}>
        Nenhuma mensagem recebida ainda.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {recebidas.map((r) => (
        <div
          key={r.id}
          className="text-xs py-2 px-2.5 rounded-lg"
          style={{ background: "var(--surface2)" }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium truncate">
              {r.nomePerfil || r.telefone || "sem telefone"}
            </span>
            <span className="flex-shrink-0" style={{ color: "var(--text3)" }}>
              {quando(r.createdAt)}
            </span>
          </div>

          <div className="truncate mt-0.5" style={{ color: "var(--text2)" }}>
            {r.texto || <em style={{ color: "var(--text3)" }}>{r.tipo.toLowerCase()}</em>}
          </div>

          {r.resposta ? (
            <div
              className="mt-1"
              style={{ color: r.resposta.status === "ENVIADA" ? "#25d366" : "#ef4444" }}
            >
              {r.resposta.status === "ENVIADA" ? "respondido" : "resposta falhou"}
            </div>
          ) : (
            <div className="flex items-start gap-1.5 mt-1" style={{ color: "var(--text3)" }}>
              <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
              <span>{r.motivoSemResposta || "sem resposta"}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
