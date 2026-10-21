"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Tag } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui";
import { baixarDanfeOficial } from "@/lib/danfe-pdf";

type NotaComChave = { chave: string; numero: string; rotulo: string };

/** NFs da avaria que tem chave de acesso: a da avaria, as das linhas e as de devolucao. */
function notasDaAvaria(avaria: any): NotaComChave[] {
  const vistas = new Map<string, NotaComChave>();
  const add = (nf: any, rotulo: string) => {
    const chave = String(nf?.chaveAcesso || "").replace(/\D/g, "");
    if (chave.length === 44 && !vistas.has(chave)) vistas.set(chave, { chave, numero: String(nf.numero || ""), rotulo });
  };
  add(avaria?.notaFiscal, "NF");
  for (const p of avaria?.produtos || []) add(p.notaFiscal, "NF");
  for (const d of avaria?.devolucoes || []) add(d, "NF devolução");
  return Array.from(vistas.values());
}

/**
 * Botoes da etiqueta para colar na mercadoria: a etiqueta propria da avaria
 * (codigo AVR + produtos afetados, 4 por folha A4) e o DANFE simplificado
 * oficial da NF, gerado pela Meu Danfe.
 */
export function EtiquetaBotoes({ avaria }: { avaria: any }) {
  const [menu, setMenu] = useState(false);
  const [gerando, setGerando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notas = notasDaAvaria(avaria);

  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [menu]);

  async function abrirDanfe(chave: string) {
    setMenu(false);
    setGerando(true);
    try {
      await baixarDanfeOficial(chave, "simplificado", { abrir: true });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar o DANFE simplificado");
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => window.open(`/imprimir/etiqueta-avaria/${avaria.id}`, "_blank")}
        title="Etiqueta para colar na mercadoria (4 por folha A4)">
        <Tag size={14} /> Etiqueta
      </Button>
      {notas.length > 0 && (
        <div ref={ref} className="relative">
          <Button variant="ghost" size="sm" loading={gerando}
            onClick={() => (notas.length === 1 ? abrirDanfe(notas[0].chave) : setMenu((m) => !m))}
            title="DANFE simplificado oficial da NF (Meu Danfe)">
            <FileText size={14} /> DANFE simplificado
          </Button>
          {menu && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-2xl z-50 py-1"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="px-3 pt-1.5 pb-1 font-mono text-[9px] tracking-[.18em] uppercase" style={{ color: "var(--text3)" }}>
                Escolha a NF
              </div>
              {notas.map((n) => (
                <button key={n.chave} onClick={() => abrirDanfe(n.chave)}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--surface2)]" style={{ color: "var(--text)" }}>
                  {n.rotulo} {n.numero}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
