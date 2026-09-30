"use client";
import { formatWeight } from "@/lib/utils";

const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

/** Mesmas cores do calendario: verde entregue, ambar ocorrencia, vermelho atrasada, azul futura. */
function corDaEntrega(status: string, dateStr: string, hojeStr: string) {
  if (["ENTREGUE", "FINALIZADO"].includes(status)) return { fg: "#10b981", bg: "rgba(16,185,129,.1)", bd: "rgba(16,185,129,.2)" };
  if (status === "OCORRENCIA") return { fg: "#d97706", bg: "rgba(245,158,11,.1)", bd: "rgba(245,158,11,.2)" };
  if (dateStr < hojeStr) return { fg: "#ef4444", bg: "rgba(239,68,68,.08)", bd: "rgba(239,68,68,.15)" };
  return { fg: "#3b82f6", bg: "rgba(59,130,246,.08)", bd: "rgba(59,130,246,.15)" };
}

/**
 * Calendario do mes em forma de lista, para o celular. A grade de 7 colunas
 * dava ~50px por dia e passava de 700px de altura com dias quase todos vazios.
 * Aqui so aparecem os dias que tem entrega, cada um com a lista completa —
 * sem o "+N mais" que a grade precisava por falta de espaco.
 */
export function AgendaListaMobile({ year, month, ultimoDia, getEntregasForDay, hojeStr, onAbrir }: {
  year: number;
  month: number; // 0-11
  ultimoDia: number;
  getEntregasForDay: (day: number) => any[];
  hojeStr: string; // YYYY-MM-DD
  onAbrir: (entregaId: string) => void;
}) {
  const dias = Array.from({ length: ultimoDia }, (_, i) => i + 1)
    .map((day) => {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { day, dateStr, entregas: getEntregasForDay(day) };
    })
    .filter((d) => d.entregas.length > 0);

  if (dias.length === 0) {
    return <p className="py-10 text-center text-sm" style={{ color: "var(--text3)" }}>Nenhuma entrega agendada neste mês.</p>;
  }

  return (
    <div>
      {dias.map(({ day, dateStr, entregas }) => {
        const hoje = dateStr === hojeStr;
        const semana = DIAS_SEMANA[new Date(year, month, day).getDay()];
        return (
          <div key={day} className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`font-mono text-[11px] tracking-widest ${hoje ? "text-orange-500 font-bold" : ""}`} style={hoje ? undefined : { color: "var(--text3)" }}>
                {semana} {String(day).padStart(2, "0")}/{String(month + 1).padStart(2, "0")}
              </span>
              {hoje && <span className="text-[10px] font-bold text-orange-500">HOJE</span>}
              <span className="ml-auto text-[10px] font-mono" style={{ color: "var(--text3)" }}>{entregas.length} entrega(s)</span>
            </div>
            <div className="space-y-1.5">
              {entregas.map((e) => {
                const c = corDaEntrega(e.status, dateStr, hojeStr);
                const nfs = (e.notas || []).map((n: any) => n.numero).filter(Boolean).join(", ");
                return (
                  <button
                    key={e.id}
                    onClick={() => onAbrir(e.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg active:opacity-70"
                    style={{ background: c.bg, border: `1px solid ${c.bd}` }}
                  >
                    <div className="text-[13px] font-semibold truncate" style={{ color: c.fg }}>{e.razaoSocial}</div>
                    <div className="mt-0.5 text-[11px] truncate" style={{ color: "var(--text2)" }}>
                      {nfs ? `NF ${nfs}` : e.codigo}
                      {e.pesoTotal ? ` · ${formatWeight(e.pesoTotal)}` : ""}
                      {e.quantidadePaletes ? ` · ${e.quantidadePaletes} pal.` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
