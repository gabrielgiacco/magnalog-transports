"use client";

import { MapPin } from "lucide-react";

// Onde o motorista estava quando mandou o canhoto.
//
// Não é mapa nem trajeto de propósito: é um ponto, registrado no momento da
// entrega, e serve de prova de presença. Desenhar uma rota com um ponto só
// sugeriria um rastreamento que não existe.
//
// A precisão aparece junto porque muda o que o dado significa: 20 metros
// confirma o endereço, 2 km confirma o bairro.

export interface Posicao {
  id: string;
  latitude: number;
  longitude: number;
  precisaoM: number | null;
  origem: string;
  registradaEm: string;
}

const ORIGEM: Record<string, string> = {
  UPLOAD_CANHOTO: "confirmado pelo motorista ao enviar o canhoto",
};

export function LocalDaEntrega({ posicoes }: { posicoes: Posicao[] }) {
  if (!posicoes || posicoes.length === 0) return null;

  const p = posicoes[0];
  const quando = new Date(p.registradaEm).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl"
      style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
    >
      <MapPin size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#25d366" }} />
      <div className="text-sm">
        <div className="font-medium">Local da entrega registrado</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text3)" }}>
          {quando} · {ORIGEM[p.origem] || p.origem.toLowerCase()}
          {p.precisaoM ? ` · precisão de cerca de ${Math.round(p.precisaoM)} m` : ""}
        </div>
        <a
          href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs mt-1 inline-block"
          style={{ color: "#60a5fa" }}
        >
          Ver no mapa
        </a>
        {posicoes.length > 1 && (
          <div className="text-xs mt-1" style={{ color: "var(--text3)" }}>
            +{posicoes.length - 1} registro(s) anterior(es)
          </div>
        )}
      </div>
    </div>
  );
}
