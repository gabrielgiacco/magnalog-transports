"use client";
import { useMemo } from "react";
import { Modal } from "@/components/ui";
import { paletesPorNF } from "@/lib/paletes-por-nf";

const fmtKg = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

export function PaletesPorNFModal({ open, onClose, notas }: { open: boolean; onClose: () => void; notas: any[] }) {
  const linhas = useMemo(
    () => paletesPorNF(notas || []).sort((a, b) => b.paletes - a.paletes),
    [notas]
  );
  const total = linhas.reduce(
    (t, l) => ({ paletes: t.paletes + l.paletes, caixas: t.caixas + l.caixas, pesoKg: t.pesoKg + l.pesoKg, volumes: t.volumes + l.volumes }),
    { paletes: 0, caixas: 0, pesoKg: 0, volumes: 0 }
  );
  const semNorma = linhas.reduce((s, l) => s + l.itensSemNorma, 0);

  const th = "px-3 py-2 text-right text-[10px] font-mono uppercase tracking-widest font-bold whitespace-nowrap";
  const td = "px-3 py-2 text-right text-sm whitespace-nowrap";

  return (
    <Modal open={open} onClose={onClose} title="Paletes por NF" size="lg">
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full">
            <thead style={{ background: "var(--surface2)", color: "var(--text3)" }}>
              <tr>
                <th className={`${th} !text-left`}>NF</th>
                <th className={th}>Paletes</th>
                <th className={th}>Caixas</th>
                <th className={th}>Peso (kg)</th>
                <th className={th}>Volumes</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.notaId} className="border-t" style={{ borderColor: "var(--border)", color: "var(--text2)" }}>
                  <td className={`${td} !text-left font-mono`}>{l.numero}</td>
                  <td className={td}>
                    <div className="font-bold" style={{ color: "var(--text)" }}>{l.paletes}</div>
                    <div className="text-[10px]" style={{ color: "var(--text3)" }}>
                      {l.inteiros} int. + {l.pontas} ponta
                    </div>
                  </td>
                  <td className={td}>{l.caixas.toLocaleString("pt-BR")}</td>
                  <td className={td}>{fmtKg(l.pesoKg)}</td>
                  <td className={td}>{l.volumes.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-bold" style={{ borderColor: "var(--border)", background: "var(--surface2)", color: "var(--text)" }}>
                <td className={`${td} !text-left`}>Total</td>
                <td className={td}>{total.paletes}</td>
                <td className={td}>{total.caixas.toLocaleString("pt-BR")}</td>
                <td className={td}>{fmtKg(total.pesoKg)}</td>
                <td className={td}>{total.volumes.toLocaleString("pt-BR")}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {semNorma > 0 && (
          <div className="text-xs rounded-lg border px-3 py-2 text-amber-500 border-amber-500/30 bg-amber-500/10">
            {semNorma} item(ns) sem norma de paletização — paletes dessas NFs podem estar subestimados.
          </div>
        )}

        <p className="text-[11px]" style={{ color: "var(--text3)" }}>
          Cada NF é paletizada separada (a ponta de uma NF não junta com a de outra).
        </p>
      </div>
    </Modal>
  );
}
