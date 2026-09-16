"use client";
import { Card } from "@/components/ui";
import { Smartphone } from "lucide-react";

export interface EventoMotorista {
  id: string;
  timestamp: string;
  ip: string | null;
  detalhes: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  CARREGADO: "Carregado",
  EM_ROTA: "Em rota",
  ENTREGUE: "Entregue",
};

const rotulo = (s?: string) => (s && STATUS_LABEL[s]) || s || "?";

const GPS_LABEL: Record<string, string> = {
  negado: "GPS negado",
  indisponivel: "GPS indisponível",
  timeout: "GPS sem resposta",
};

/**
 * Ações que o motorista fez pelo link, na aba Histórico. Lê o AuditLog do
 * tipo ENTREGA_STATUS_MOTORISTA — é a única trilha que distingue "o motorista
 * confirmou" de "a equipe mudou o status". Some quando não há nada.
 */
export function EventosMotorista({ eventos }: { eventos: EventoMotorista[] }) {
  if (!eventos?.length) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Smartphone size={14} className="text-violet-500" />
        <span className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-neutral-400">
          Ações do motorista (link)
        </span>
      </div>
      <div className="space-y-2">
        {eventos.map((ev) => {
          let d: { de?: string; para?: string; gps?: string } = {};
          try { d = ev.detalhes ? JSON.parse(ev.detalhes) : {}; } catch { /* detalhes livre */ }
          const semGps = d.gps && d.gps !== "ok";
          return (
            <div key={ev.id} className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-violet-700 dark:text-violet-300">
                  {rotulo(d.de)} → {rotulo(d.para)}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-neutral-500">
                  {new Date(ev.timestamp).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 dark:text-neutral-400 flex flex-wrap gap-x-3">
                {semGps
                  ? <span className="text-amber-600 dark:text-amber-400 font-bold">{(d.gps && GPS_LABEL[d.gps]) || d.gps}</span>
                  : <span>GPS registrado</span>}
                {ev.ip && <span>IP {ev.ip}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
