"use client";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui";

// Lista enxuta para celular: NF e status; o resto abre no modal de detalhes
export function ListaNotasPortalMobile({ notas, onAbrir }: { notas: any[]; onAbrir: (n: any) => void }) {
  return (
    <ul className="md:hidden">
      {notas.map((n) => (
        <li key={n.id} style={{ borderBottom: "1px solid var(--border)" }}>
          <button type="button" onClick={() => onAbrir(n)}
            className="w-full min-h-[52px] px-3 py-2 flex items-center justify-between gap-3 text-left">
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold" style={{ color: "var(--accent)" }}>NF {n.numero}</div>
              {n.serie && <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>Série {n.serie}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {n.entrega?.status === "OCORRENCIA" && (
                <span className="w-2 h-2 rounded-full bg-red-500" aria-label="Ocorrência" />
              )}
              {n.entrega ? <StatusBadge status={n.entrega.status} /> : <span className="badge badge-PROGRAMADO">Programado</span>}
              <ChevronRight size={16} style={{ color: "var(--text3)" }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
