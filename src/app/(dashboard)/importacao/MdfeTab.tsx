"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Empty, Loading } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Upload, FileText, Loader2, Search, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Truck } from "lucide-react";

interface Mdfe {
  id: string;
  chaveAcesso: string;
  numero: string;
  serie: string | null;
  ufInicio: string;
  ufFim: string;
  dataInicioViagem: string | null;
  placaTracao: string | null;
  placaReboque: string | null;
  condutorNome: string | null;
  qtdCTe: number;
  qtdNFe: number;
  valorCarga: number;
  pesoCarga: number;
  status: "AUTORIZADO" | "ENCERRADO" | "CANCELADO";
  encerradoEm: string | null;
  encerradoPor: string | null;
  rota: { id: string; codigo: string } | null;
  _count?: { documentos: number };
}

// Acima disso, um manifesto em aberto vira alerta. Nao ha prazo legal unico,
// mas viagem intermunicipal que passa disso quase certamente ja terminou.
const DIAS_ALERTA = 3;

function diasEmAberto(m: Mdfe): number | null {
  if (!m.dataInicioViagem) return null;
  return Math.floor((Date.now() - new Date(m.dataInicioViagem).getTime()) / 86_400_000);
}

export function MdfeTab() {
  const [lista, setLista] = useState<Mdfe[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"" | "AUTORIZADO" | "ENCERRADO">("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtro) params.set("status", filtro);
      if (busca) params.set("q", busca);
      const r = await fetch(`/api/mdfe?${params}`);
      if (r.ok) setLista((await r.json()).mdfes || []);
    } finally { setLoading(false); }
  }, [filtro, busca]);

  useEffect(() => { carregar(); }, [carregar]);

  async function enviar(files: FileList | null) {
    if (!files || files.length === 0) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const r = await fetch("/api/mdfe", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao importar");

      const partes: string[] = [];
      if (d.importados) partes.push(`${d.importados} importado(s)`);
      if (d.encerrados) partes.push(`${d.encerrados} encerrado(s)`);
      if (d.duplicados) partes.push(`${d.duplicados} ja existia(m)`);
      if (d.vinculados) partes.push(`${d.vinculados} vinculado(s) a rota`);
      toast.success(partes.join(" · ") || "Nada a fazer");

      if (d.erros?.length) {
        for (const e of d.erros.slice(0, 3)) toast.error(`${e.arquivo}: ${e.erro}`);
      }
      carregar();
    } catch (e: any) {
      toast.error(e.message || "Erro ao importar");
    } finally { setEnviando(false); }
  }

  async function abrirDetalhe(id: string) {
    if (expandido === id) { setExpandido(null); setDetalhe(null); return; }
    setExpandido(id);
    setDetalhe(null);
    const r = await fetch(`/api/mdfe/${id}`);
    if (r.ok) setDetalhe(await r.json());
  }

  async function alternarEncerrado(m: Mdfe) {
    const encerrar = m.status !== "ENCERRADO";
    if (encerrar && !window.confirm(
      `Marcar o MDF-e ${m.numero} como encerrado?\n\nIsto registra apenas no TMS — o encerramento na SEFAZ precisa ser feito no emissor. Se você importar depois o XML do evento, ele substitui esta marcação manual.`
    )) return;
    try {
      const r = await fetch(`/api/mdfe/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encerrar }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro");
      toast.success(encerrar ? "Marcado como encerrado" : "Reaberto");
      carregar();
    } catch (e: any) { toast.error(e.message); }
  }

  const emAberto = lista.filter((m) => m.status === "AUTORIZADO");
  const atrasados = emAberto.filter((m) => (diasEmAberto(m) ?? 0) > DIAS_ALERTA);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <Truck size={20} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold">MDF-e — Manifesto de Documentos Fiscais</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text2)" }}>
              Importe o XML do manifesto emitido no seu emissor. O mesmo campo aceita o XML do
              evento de encerramento — ele fecha o manifesto correspondente automaticamente.
            </div>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); enviar(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl cursor-pointer transition-all py-6 flex flex-col items-center justify-center gap-1 text-center"
          style={{
            border: `2px dashed ${dragging ? "var(--accent)" : "var(--border2)"}`,
            background: dragging ? "rgba(249,115,22,.05)" : "var(--surface2)",
          }}
        >
          {enviando ? <Loader2 size={22} className="animate-spin text-orange-500" /> : <Upload size={22} style={{ color: "var(--text3)" }} />}
          <p className="text-sm font-medium" style={{ color: "var(--text2)" }}>
            {enviando ? "Processando..." : "Arraste XMLs de MDF-e aqui ou clique para selecionar"}
          </p>
          <p className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
            manifesto ou evento de encerramento
          </p>
        </div>
        <input ref={inputRef} type="file" multiple accept=".xml,text/xml" className="hidden"
          onChange={(e) => { enviar(e.target.files); e.target.value = ""; }} />
      </Card>

      {atrasados.length > 0 && (
        <Card className="p-3" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.3)" }}>
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle size={15} style={{ color: "#d97706" }} />
            <span style={{ color: "var(--text)" }}>
              <b>{atrasados.length}</b> manifesto(s) em aberto há mais de {DIAS_ALERTA} dias.
              Manifesto esquecido aberto gera pendência na SEFAZ.
            </span>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Número, chave, placa ou condutor..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </div>
        {([["", "Todos"], ["AUTORIZADO", "Em aberto"], ["ENCERRADO", "Encerrados"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setFiltro(v as any)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filtro === v ? "bg-orange-500/10 text-orange-500" : "text-[var(--text2)] hover:bg-[var(--surface)]"}`}
            style={{ border: "1px solid var(--border)" }}>
            {label}
            {v === "AUTORIZADO" && emAberto.length > 0 && ` (${emAberto.length})`}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : lista.length === 0 ? (
        <Empty icon="📋" text="Nenhum MDF-e importado ainda." />
      ) : (
        <div className="space-y-2">
          {lista.map((m) => {
            const dias = diasEmAberto(m);
            const aberto = m.status === "AUTORIZADO";
            const atrasado = aberto && (dias ?? 0) > DIAS_ALERTA;
            return (
              <Card key={m.id} className="p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>
                      MDF-e {m.numero}{m.serie ? `/${m.serie}` : ""}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={aberto
                        ? { background: atrasado ? "rgba(245,158,11,.15)" : "rgba(59,130,246,.15)", color: atrasado ? "#d97706" : "#3b82f6" }
                        : { background: "rgba(16,185,129,.15)", color: "#10b981" }}>
                      {aberto ? (atrasado ? `Aberto há ${dias}d` : "Em aberto") : "Encerrado"}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--text2)" }}>{m.placaTracao || "—"}</span>
                    <span className="text-[11px]" style={{ color: "var(--text3)" }}>{m.ufInicio} → {m.ufFim}</span>
                    {m.rota && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                        {m.rota.codigo}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono" style={{ color: "var(--text3)" }}>
                      {m._count?.documentos ?? m.qtdCTe} doc · {formatCurrency(m.valorCarga)}
                    </span>
                    <span className="text-[11px] font-mono" style={{ color: "var(--text3)" }}>
                      {m.dataInicioViagem ? formatDate(m.dataInicioViagem) : "—"}
                    </span>
                    <button onClick={() => alternarEncerrado(m)}
                      className="text-[11px] px-2 py-1 rounded-lg hover:opacity-70"
                      style={{ background: "var(--surface2)", color: aberto ? "#10b981" : "var(--text3)" }}
                      title={aberto ? "Marcar como encerrado" : "Reabrir"}>
                      <CheckCircle2 size={12} className="inline mr-1" />
                      {aberto ? "Encerrar" : "Reabrir"}
                    </button>
                    <button onClick={() => abrirDetalhe(m.id)} className="p-1 rounded hover:opacity-70" style={{ color: "var(--text3)" }}>
                      {expandido === m.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {m.condutorNome && (
                  <div className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>
                    Condutor: {m.condutorNome}
                    {m.placaReboque && ` · Reboque: ${m.placaReboque}`}
                    {m.status === "ENCERRADO" && m.encerradoPor && (
                      <> · Encerrado {m.encerradoPor === "EVENTO" ? "pelo XML do evento" : "manualmente"}
                        {m.encerradoEm && ` em ${formatDate(m.encerradoEm)}`}</>
                    )}
                  </div>
                )}

                {expandido === m.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                    {!detalhe ? <Loading /> : (
                      <>
                        <div className="text-[11px] mb-2" style={{ color: "var(--text2)" }}>
                          {detalhe.documentosNoTms} de {detalhe.documentos.length} documento(s) manifestado(s) já estão no TMS
                        </div>
                        <div className="rounded-lg overflow-hidden max-h-60 overflow-y-auto" style={{ border: "1px solid var(--border)" }}>
                          {detalhe.documentos.map((d: any, i: number) => (
                            <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 text-[10px]"
                              style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                              <FileText size={11} style={{ color: d.existeNoTms ? "#10b981" : "var(--text3)" }} />
                              <span className="font-mono" style={{ color: "var(--text3)" }}>{d.tipo}</span>
                              <span className="font-mono flex-1 break-all" style={{ color: "var(--text2)" }}>{d.chaveAcesso}</span>
                              <span style={{ color: "var(--text3)" }}>{d.municipioDescarga}</span>
                              <span className="font-mono" style={{ color: d.existeNoTms ? "#10b981" : "var(--text3)" }}>
                                {d.existeNoTms ? `n. ${d.numeroNoTms}` : "não importado"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
