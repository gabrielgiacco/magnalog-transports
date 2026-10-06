"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@/components/ui";
import { FileSpreadsheet, FileText } from "lucide-react";

type Embarcador = { raiz: string; nome: string; total: number };

const TIPOS = [
  { value: "AVARIA", label: "Avaria" },
  { value: "FALTA", label: "Falta" },
  { value: "INVERSAO", label: "Inversão" },
  { value: "SOBRA", label: "Sobra" },
];

const inputStyle = {
  background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)",
};
const inputCls = "w-full rounded-lg px-3 py-2 text-sm";

// Data local em YYYY-MM-DD, com deslocamento em dias
function dataLocal(deltaDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deltaDias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ExportarAvariasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [embarcadores, setEmbarcadores] = useState<Embarcador[] | null>(null);
  const [embarcador, setEmbarcador] = useState("");
  const [de, setDe] = useState(() => dataLocal(-90));
  const [ate, setAte] = useState(() => dataLocal());
  const [tipos, setTipos] = useState<string[]>(["AVARIA", "FALTA"]);

  // Carrega a lista uma vez, na primeira abertura
  useEffect(() => {
    if (!open || embarcadores) return;
    fetch("/api/avarias/embarcadores")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setEmbarcadores(Array.isArray(d) ? d : []))
      .catch(() => setEmbarcadores([]));
  }, [open, embarcadores]);

  function alternarTipo(v: string) {
    setTipos((t) => (t.includes(v) ? t.filter((x) => x !== v) : [...t, v]));
  }

  const semTipo = tipos.length === 0;

  function qs() {
    const p = new URLSearchParams();
    if (embarcador) p.set("embarcador", embarcador);
    if (de) p.set("de", de);
    if (ate) p.set("ate", ate);
    if (tipos.length) p.set("tipos", tipos.join(","));
    return p.toString();
  }

  const labelCls = "block text-xs font-medium mb-1";

  return (
    <Modal open={open} onClose={onClose} title="Exportar avarias e faltas" size="md">
      <div className="space-y-4">
        <div>
          <label className={labelCls} style={{ color: "var(--text2)" }}>Embarcador</label>
          <select className={inputCls} style={inputStyle} value={embarcador}
            onChange={(e) => setEmbarcador(e.target.value)} disabled={!embarcadores}>
            {!embarcadores ? (
              <option value="">Carregando…</option>
            ) : (
              <>
                <option value="">Todos os embarcadores</option>
                {embarcadores.map((e) => (
                  <option key={e.raiz} value={e.raiz}>{e.nome} ({e.total})</option>
                ))}
              </>
            )}
          </select>
        </div>

        <div>
          <label className={labelCls} style={{ color: "var(--text2)" }}>Período (data da ocorrência)</label>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" aria-label="De" className={inputCls} style={inputStyle}
              value={de} onChange={(e) => setDe(e.target.value)} />
            <input type="date" aria-label="Até" className={inputCls} style={inputStyle}
              value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>

        <div>
          <label className={labelCls} style={{ color: "var(--text2)" }}>Tipos</label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {TIPOS.map((t) => (
              <label key={t.value} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text)" }}>
                <input type="checkbox" checked={tipos.includes(t.value)} onChange={() => alternarTipo(t.value)} />
                {t.label}
              </label>
            ))}
          </div>
          {semTipo && <p className="text-xs mt-1 text-red-500">Selecione ao menos um tipo.</p>}
        </div>

        <p className="text-xs" style={{ color: "var(--text2)" }}>
          O PDF abre numa nova aba — use Imprimir › Salvar como PDF.
        </p>

        <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button variant="ghost" disabled={semTipo}
            onClick={() => window.open("/imprimir/relatorio-avarias?" + qs(), "_blank")}>
            <FileText size={14} /> Gerar PDF
          </Button>
          <Button disabled={semTipo}
            onClick={() => window.open("/api/avarias/export?" + qs(), "_blank")}>
            <FileSpreadsheet size={14} /> Baixar planilha
          </Button>
        </div>
      </div>
    </Modal>
  );
}
