"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, Empty, StatusBadge, Table, Th, Td, Tr, Modal } from "@/components/ui";
import { formatWeight, formatDate, formatCurrency, formatCNPJ } from "@/lib/utils";
import {
  Upload, FileText, CheckCircle, XCircle, AlertTriangle, X, ChevronRight,
  Search, RefreshCw, ChevronLeft, ExternalLink, FileSearch,
  Printer, Download, RotateCcw, FileX, Eye, ZoomIn, ZoomOut, Key, Loader2, PackagePlus, Check,
  Receipt, Link2, Trash2, Truck,
} from "lucide-react";
import { DanfeViewer } from "@/components/danfe/DanfeViewer";
import { DanfeData, parseDanfeXML } from "@/lib/danfe-parser";
import { baixarDanfeOficial, ROTULO_FORMATO, type FormatoDanfe } from "@/lib/danfe-pdf";
import { NfseTab } from "./NfseTab";
import { CteTab } from "./CteTab";

// ── Types ──
interface ResultItem {
  numero: string; destinatario: string; cidade: string;
  peso: number; volumes: number; entrega: string; agrupada: boolean;
}
interface ImportResult {
  importadas: number; duplicadas: number; agrupadas: number;
  ctesImportados: number; erros: { arquivo: string; erro: string }[];
  notas: ResultItem[]; ctes: any[];
}

type Tab = "importar" | "notas" | "danfe" | "nfse" | "cte";
type InputMode = "chave" | "xml" | "lote";

type LoteItem = { chave: string; status: "pendente" | "consultando" | "ok" | "erro"; erro?: string; xml?: string };

// ── Tab Button ──
function TabBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: any; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all border-b-2
        ${active ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
      <Icon size={16} /> {children}
    </button>
  );
}

export default function ImportacaoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "importar";
  const [tab, setTab] = useState<Tab>(initialTab);

  // ── Importar XML state ──
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // ── Notas Fiscais state ──
  const [notas, setNotas] = useState<any[]>([]);
  const [notasLoading, setNotasLoading] = useState(false);
  const [notasTotal, setNotasTotal] = useState(0);
  const [notasPage, setNotasPage] = useState(1);
  const [notasPages, setNotasPages] = useState(1);
  const [notasSearch, setNotasSearch] = useState("");
  const [debouncedNotasSearch, setDebouncedNotasSearch] = useState("");
  const [semEntrega, setSemEntrega] = useState(false);
  // Guarda os objetos completos das NFs selecionadas — assim a seleção sobrevive
  // a buscas/filtros/paginação e sabemos o destinatario mesmo de NFs fora da página atual.
  const [selectedNfs, setSelectedNfs] = useState<any[]>([]);

  // ── Consulta DANFE state ──
  const [danfeMode, setDanfeMode] = useState<InputMode>("chave");
  const [danfeDragging, setDanfeDragging] = useState(false);
  const [danfeData, setDanfeData] = useState<DanfeData | null>(null);
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [danfeError, setDanfeError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [chave, setChave] = useState("");
  const [danfeLoading, setDanfeLoading] = useState(false);
  const [danfeImporting, setDanfeImporting] = useState(false);
  const [danfeImportResult, setDanfeImportResult] = useState<{ importadas: number; agrupadas: number; duplicadas: number } | null>(null);
  const [showDevolucaoConfirm, setShowDevolucaoConfirm] = useState(false);
  const [sendingDevolucao, setSendingDevolucao] = useState(false);
  const [devolucaoResult, setDevolucaoResult] = useState<"nova" | "duplicada" | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [formatoDanfe, setFormatoDanfe] = useState<FormatoDanfe>("completo");
  const danfeRef = useRef<HTMLDivElement>(null);

  // ── Lote DANFE state ──
  const [loteInput, setLoteInput] = useState("");
  const [loteItems, setLoteItems] = useState<LoteItem[]>([]);
  const [loteRunning, setLoteRunning] = useState(false);
  const [loteZipping, setLoteZipping] = useState(false);

  // ══════════════════════════════════════
  // IMPORTAR XML
  // ══════════════════════════════════════
  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const xmlFiles = Array.from(newFiles).filter((f) => f.name.toLowerCase().endsWith(".xml") || f.type === "text/xml");
    if (!xmlFiles.length) { toast.error("Selecione apenas arquivos XML"); return; }
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...xmlFiles.filter((f) => !existingNames.has(f.name))];
    });
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files);
  }

  async function handleImport() {
    if (!files.length) return;
    setImportLoading(true); setResult(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/importacao", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data); setFiles([]);
      if (data.importadas > 0 || data.agrupadas > 0) toast.success(`${data.importadas} criadas, ${data.agrupadas} agrupadas!`);
      else if (data.duplicadas > 0 && !data.importadas) toast("Todas as notas já estavam importadas", { icon: "ℹ️" });
    } catch (e: any) { toast.error(e.message); }
    finally { setImportLoading(false); }
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const fmtSize = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

  // ══════════════════════════════════════
  // NOTAS FISCAIS
  // ══════════════════════════════════════
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedNotasSearch(notasSearch); setNotasPage(1); }, 400);
    return () => clearTimeout(t);
  }, [notasSearch]);

  const fetchNotas = useCallback(async () => {
    setNotasLoading(true);
    const params = new URLSearchParams({ page: String(notasPage), limit: "50" });
    if (debouncedNotasSearch) params.set("q", debouncedNotasSearch);
    if (semEntrega) params.set("semEntrega", "true");
    const res = await fetch(`/api/notas?${params}`);
    const data = await res.json();
    setNotas(data.notas || []); setNotasTotal(data.total || 0); setNotasPages(data.pages || 1);
    setNotasLoading(false);
  }, [notasPage, debouncedNotasSearch, semEntrega]);

  useEffect(() => { if (tab === "notas") fetchNotas(); }, [tab, fetchNotas]);

  // A seleção só zera quando o usuário clica no X da barra flutuante (ou sai da tab).
  useEffect(() => { if (tab !== "notas") setSelectedNfs([]); }, [tab]);

  const selectedNfIds = selectedNfs.map((n) => n.id);
  const selectedNfIdSet = new Set(selectedNfIds);

  const toggleNfSelection = (nf: any) => {
    setSelectedNfs((prev) => prev.some((n) => n.id === nf.id) ? prev.filter((n) => n.id !== nf.id) : [...prev, nf]);
  };
  const toggleSelectAllNfs = (checked: boolean) => {
    const visibleIds = new Set(notas.map((n: any) => n.id));
    if (checked) {
      setSelectedNfs((prev) => {
        const already = new Set(prev.map((n) => n.id));
        return [...prev, ...notas.filter((n: any) => !already.has(n.id))];
      });
    } else {
      // Desmarca só as visíveis; mantém seleção de outras páginas/buscas
      setSelectedNfs((prev) => prev.filter((n) => !visibleIds.has(n.id)));
    }
  };
  const allVisibleSelected = notas.length > 0 && notas.every((n: any) => selectedNfIdSet.has(n.id));
  const destinatariosSelecionados = new Set(
    selectedNfs.map((n: any) => String(n.destinatarioCnpj || "").replace(/\D/g, ""))
  ).size;
  const handleImprimirFichaConferencia = () => {
    if (selectedNfIds.length === 0) return;
    window.open("/imprimir/conferencia?nfIds=" + selectedNfIds.join(","), "_blank");
  };

  // ══════════════════════════════════════
  // CONSULTA DANFE
  // ══════════════════════════════════════
  const processXml = useCallback((content: string, name: string) => {
    try {
      const parsed = parseDanfeXML(content);
      setXmlContent(content); setFileName(name); setDanfeData(parsed); setDanfeError(null);
      toast.success("DANFE carregado com sucesso!");
    } catch (e: any) { setDanfeError(e.message || "Erro ao processar o XML"); toast.error("Erro ao processar XML"); }
  }, []);

  const processFile = useCallback(async (file: File) => {
    setDanfeError(null); setDanfeData(null);
    if (!file.name.toLowerCase().endsWith(".xml")) { setDanfeError("Por favor, selecione um arquivo XML de NF-e."); return; }
    const content = await file.text();
    processXml(content, file.name);
  }, [processXml]);

  async function handleConsultaChave() {
    const clean = chave.replace(/\s/g, "");
    if (!/^\d{44}$/.test(clean)) { setDanfeError("A chave de acesso deve conter exatamente 44 dígitos numéricos."); toast.error("Chave de acesso inválida"); return; }
    setDanfeError(null); setDanfeData(null); setDanfeLoading(true);
    try {
      const res = await fetch("/api/consulta-danfe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: clean }) });
      const data = await res.json();
      if (!res.ok) { setDanfeError(data.error || "Erro ao consultar NF-e."); toast.error(data.error || "Erro ao consultar NF-e"); return; }
      processXml(data.xml, `NFe_${clean}.xml`);
    } catch { setDanfeError("Erro de conexão ao consultar NF-e."); toast.error("Erro de conexão"); }
    finally { setDanfeLoading(false); }
  }

  function handleDanfeDrop(e: React.DragEvent) { e.preventDefault(); setDanfeDragging(false); const file = e.dataTransfer.files?.[0]; if (file) processFile(file); }

  // ── Lote DANFE handlers ──
  function parseChavesFromInput(raw: string): string[] {
    const matches = raw.match(/\d{44}/g) || [];
    return Array.from(new Set(matches));
  }

  function handleLotePreview() {
    const chaves = parseChavesFromInput(loteInput);
    if (chaves.length === 0) { toast.error("Nenhuma chave de 44 dígitos encontrada"); return; }
    if (chaves.length > 50) { toast.error("Limite de 50 chaves por lote"); return; }
    setLoteItems(chaves.map((c) => ({ chave: c, status: "pendente" })));
  }

  async function consultarUmaChave(chave: string): Promise<{ ok: true; xml: string } | { ok: false; erro: string }> {
    try {
      const res = await fetch("/api/consulta-danfe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave }) });
      const data = await res.json();
      if (!res.ok) return { ok: false, erro: data.error || "Erro" };
      return { ok: true, xml: data.xml };
    } catch (e: any) {
      return { ok: false, erro: e.message || "Erro de conexão" };
    }
  }

  async function handleRodarLote() {
    if (loteItems.length === 0) { toast.error("Adicione chaves primeiro (Analisar)"); return; }
    setLoteRunning(true);
    const CONCURRENCY = 3;
    let idx = 0;
    const items = [...loteItems];

    async function worker() {
      while (idx < items.length) {
        const my = idx++;
        setLoteItems((prev) => prev.map((it, i) => i === my ? { ...it, status: "consultando" } : it));
        const r = await consultarUmaChave(items[my].chave);
        setLoteItems((prev) => prev.map((it, i) => i === my ? (
          r.ok ? { ...it, status: "ok", xml: r.xml } : { ...it, status: "erro", erro: r.erro }
        ) : it));
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));
    setLoteRunning(false);
    toast.success("Consulta concluída");
  }

  async function handleBaixarZip() {
    setLoteZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const okItems = loteItems.filter((it) => it.status === "ok" && it.xml);
      if (okItems.length === 0) { toast.error("Nenhum XML disponível para baixar"); return; }
      okItems.forEach((it) => zip.file(`NFe_${it.chave}.xml`, it.xml!));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `NFes_${new Date().toISOString().slice(0, 10)}_${okItems.length}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`ZIP com ${okItems.length} XML(s) baixado`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar ZIP");
    } finally {
      setLoteZipping(false);
    }
  }

  function handleLoteReset() {
    setLoteInput("");
    setLoteItems([]);
  }
  function handleDanfeFileSelect(e: React.ChangeEvent<HTMLInputElement>) { const file = e.target.files?.[0]; if (file) processFile(file); e.target.value = ""; }
  function handleDanfeReset() { setDanfeData(null); setXmlContent(null); setFileName(""); setDanfeError(null); setZoom(100); setChave(""); setDanfeImportResult(null); setDevolucaoResult(null); }

  async function handleEnviarParaAvarias() {
    if (!xmlContent) return;
    setSendingDevolucao(true);
    try {
      const blob = new Blob([xmlContent], { type: "text/xml" });
      const file = new File([blob], fileName || "nfe.xml", { type: "text/xml" });
      const formData = new FormData();
      formData.append("files", file);
      const res = await fetch("/api/avarias/devolucao-avulsa", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao enviar para Avarias"); return; }
      if (data.duplicadas > 0) { setDevolucaoResult("duplicada"); toast("NF já registrada em Avarias", { icon: "⚠️" }); }
      else if (data.importadas > 0) { setDevolucaoResult("nova"); toast.success("NF enviada para Avarias e Devoluções!"); }
      setShowDevolucaoConfirm(false);
    } catch { toast.error("Erro ao enviar para Avarias"); }
    finally { setSendingDevolucao(false); }
  }

  async function handleDownloadPdf() {
    if (!danfeData?.chaveAcesso) { toast.error("Chave de acesso indisponivel"); return; }
    setDownloadingPdf(true);
    try {
      const nome = `DANFE_${danfeData.numero || "nfe"}_${danfeData.serie || ""}`;
      // xmlContent serve de reserva: se a nota ainda nao estiver na Area do
      // Cliente do Meu Danfe, a rota envia esse XML (gratis) e baixa em seguida.
      await baixarDanfeOficial(danfeData.chaveAcesso, formatoDanfe, { filename: nome, xml: xmlContent || undefined });
      toast.success("PDF gerado!");
    } catch (e: any) { toast.error(e.message || "Erro ao gerar PDF"); }
    finally { setDownloadingPdf(false); }
  }
  async function handleAddToEntrega() {
    if (!xmlContent) return;
    setDanfeImporting(true);
    try {
      const blob = new Blob([xmlContent], { type: "text/xml" });
      const file = new File([blob], fileName || "nfe.xml", { type: "text/xml" });
      const formData = new FormData();
      formData.append("files", file);
      const res = await fetch("/api/importacao", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao importar NF-e"); return; }
      setDanfeImportResult({ importadas: data.importadas, agrupadas: data.agrupadas, duplicadas: data.duplicadas });
      if (data.duplicadas > 0) toast("NF-e já importada anteriormente", { icon: "⚠️" });
      else if (data.agrupadas > 0) toast.success("NF-e agrupada a uma entrega existente!");
      else if (data.importadas > 0) toast.success("NF-e importada e nova entrega criada!");
    } catch { toast.error("Erro ao importar NF-e"); }
    finally { setDanfeImporting(false); }
  }
  function handleDownloadXml() {
    if (!xmlContent || !fileName) return;
    const blob = new Blob([xmlContent], { type: "text/xml" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
  }

  // ══════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════
  return (
    <>
      <Topbar title="Documentos Fiscais" subtitle="Importação, consulta de notas e visualização de DANFE" />
      <div className="flex-1 overflow-y-auto">
        {/* Tabs */}
        <div className="flex gap-1 px-6 border-b" style={{ borderColor: "var(--border)" }}>
          <TabBtn active={tab === "importar"} onClick={() => setTab("importar")} icon={Upload}>Importar XML</TabBtn>
          <TabBtn active={tab === "notas"} onClick={() => setTab("notas")} icon={FileText}>Notas Fiscais</TabBtn>
          <TabBtn active={tab === "danfe"} onClick={() => setTab("danfe")} icon={FileSearch}>Consulta DANFE</TabBtn>
          <TabBtn active={tab === "nfse"} onClick={() => setTab("nfse")} icon={Receipt}>Notas de Serviço</TabBtn>
          <TabBtn active={tab === "cte"} onClick={() => setTab("cte")} icon={Truck}>CT-e</TabBtn>
        </div>

        <div className="p-6 space-y-5">
          {/* ═══════ TAB: IMPORTAR XML ═══════ */}
          {tab === "importar" && (
            <>
              {!result && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  className="relative rounded-2xl transition-all cursor-pointer"
                  style={{ border: `2px dashed ${dragging ? "var(--accent)" : "var(--border2)"}`, background: dragging ? "rgba(249,115,22,.05)" : "var(--surface)", minHeight: "200px" }}
                  onClick={() => document.getElementById("xml-input")?.click()}>
                  <input id="xml-input" type="file" multiple accept=".xml,text/xml" className="hidden" onChange={(e) => addFiles(e.target.files)} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <Upload size={48} className="text-gray-400 mb-4" />
                    <p className="text-gray-600 mb-2 font-head">Arraste os arquivos XML aqui ou clique para selecionar</p>
                    <p className="text-sm text-gray-500 font-mono">Suporta múltiplos arquivos simultâneos</p>
                    <div className="flex gap-2 mt-4 justify-center">
                      {["XML NF-e", "XML CT-e"].map((tag) => (
                        <span key={tag} className="text-[11px] px-3 py-1 rounded-full font-bold font-mono" style={{ background: "var(--accent)", color: "white" }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {files.length > 0 && (
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-head text-sm font-bold">{files.length} arquivo(s) na fila · {fmtSize(totalSize)}</span>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setFiles([])}>Limpar tudo</Button>
                      <Button onClick={handleImport} loading={importLoading}><Upload size={15} /> Importar {files.length} arquivo(s)</Button>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                        <FileText size={14} style={{ color: "var(--accent)" }} />
                        <span className="flex-1 text-xs font-mono truncate">{f.name}</span>
                        <span className="text-[10px]" style={{ color: "var(--text3)" }}>{fmtSize(f.size)}</span>
                        <button onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="hover:opacity-60 transition-all" style={{ color: "var(--text3)" }}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {importLoading && (
                <Card className="flex flex-col items-center py-12 gap-4">
                  <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--border2)", borderTopColor: "var(--accent)" }} />
                  <p className="text-sm" style={{ color: "var(--text2)" }}>Processando {files.length} arquivo(s)...</p>
                </Card>
              )}

              {result && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { val: result.importadas, label: "Novas entregas", color: "#10b981", Icon: CheckCircle },
                      { val: result.agrupadas, label: "Agrupadas", color: "#3b82f6", Icon: CheckCircle },
                      { val: result.duplicadas, label: "Duplicadas", color: "#64748b", Icon: AlertTriangle },
                      { val: result.erros.length, label: "Erros", color: "#ef4444", Icon: XCircle },
                    ].map(({ val, label, color, Icon }) => (
                      <div key={label} className="rounded-xl p-4 flex items-center gap-3" style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
                        <Icon size={22} style={{ color }} />
                        <div>
                          <div className="font-head text-2xl font-black" style={{ color }}>{val}</div>
                          <div className="text-[10px] font-mono uppercase" style={{ color }}>{label}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {result.ctesImportados > 0 && (
                    <Card>
                      <h3 className="font-bold flex items-center gap-2 font-head text-sm mb-3"><CheckCircle size={18} style={{ color: "#f59e0b" }} />{result.ctesImportados} CT-e(s) processado(s)</h3>
                      {result.ctes.map((cte: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg mb-2" style={{ background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)" }}>
                          <div className="flex items-center gap-4 mb-1">
                            <span className="font-mono text-xs font-bold">CT-e {cte.numero}</span>
                            <span className="text-xs" style={{ color: "var(--text2)" }}>{cte.tomador}</span>
                            <span className="font-mono text-xs font-bold" style={{ color: "#f59e0b" }}>R$ {cte.valor?.toFixed(2)}</span>
                            {cte.reprocessado && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-mono">Reprocessado</span>}
                          </div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>
                            <span className="font-mono">Notas vinculadas: {cte.vinculadas || 0}</span>
                            {cte.debug?.entregasAtualizadas > 0 && <span className="ml-3 text-emerald-500">✓ Frete atualizado em {cte.debug.entregasAtualizadas} entrega(s)</span>}
                            {cte.debug?.notasEncontradas === 0 && <span className="ml-3 text-red-400">✗ Nenhuma NF correspondente encontrada no sistema</span>}
                          </div>
                        </div>
                      ))}
                    </Card>
                  )}

                  {result.erros.length > 0 && (
                    <Card>
                      <div className="font-head text-sm font-bold mb-3 text-red-400">Erros de processamento</div>
                      {result.erros.map((e, i) => (
                        <div key={i} className="flex gap-3 p-2.5 rounded-lg mb-2" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}>
                          <XCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
                          <div>
                            <div className="text-xs font-mono" style={{ color: "#ef4444" }}>{e.arquivo}</div>
                            <div className="text-xs mt-0.5" style={{ color: "var(--text2)" }}>{e.erro}</div>
                          </div>
                        </div>
                      ))}
                    </Card>
                  )}

                  {result.notas.length > 0 && (
                    <Card>
                      <div className="flex items-center justify-between mb-4">
                        <div className="font-head text-sm font-bold">Notas processadas</div>
                        <Button variant="ghost" size="sm" onClick={() => router.push("/entregas")}>Ver entregas <ChevronRight size={14} /></Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr>
                              {["NF", "Destinatário", "Cidade", "Peso", "Vol.", "Entrega", "Tipo"].map((h) => (
                                <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-normal font-mono" style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.notas.map((n, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--text2)" }}>{n.numero}</td>
                                <td className="px-3 py-2.5 text-sm font-medium">{n.destinatario}</td>
                                <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text2)" }}>{n.cidade}</td>
                                <td className="px-3 py-2.5 text-xs font-mono">{formatWeight(n.peso)}</td>
                                <td className="px-3 py-2.5 text-xs font-mono">{n.volumes}</td>
                                <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--accent)" }}>{n.entrega}</td>
                                <td className="px-3 py-2.5">
                                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${n.agrupada ? "text-blue-400 bg-blue-400/10 border border-blue-400/30" : "text-emerald-400 bg-emerald-400/10 border border-emerald-400/30"}`}>
                                    {n.agrupada ? "Agrupada" : "Nova"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}

                  <div className="flex justify-center">
                    <Button variant="ghost" onClick={() => setResult(null)}><Upload size={15} /> Importar mais arquivos</Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══════ TAB: NOTAS FISCAIS ═══════ */}
          {tab === "notas" && (
            <>
              <Card className="p-4">
                <div className="flex gap-3 items-center flex-wrap">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
                    <input value={notasSearch} onChange={e => setNotasSearch(e.target.value)}
                      placeholder="Buscar NF, emitente, destinatário, chave..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "var(--text2)" }}>
                    <input type="checkbox" checked={semEntrega} onChange={e => { setSemEntrega(e.target.checked); setNotasPage(1); }} className="accent-orange-500 w-3.5 h-3.5" />
                    Somente sem entrega vinculada
                  </label>
                  <Button variant="ghost" size="sm" onClick={fetchNotas}><RefreshCw size={13} /> Atualizar</Button>
                  <span className="text-xs font-mono ml-auto" style={{ color: "var(--text3)" }}>{notasTotal} nota{notasTotal !== 1 ? "s" : ""}</span>
                </div>
              </Card>

              <Card className="p-0 overflow-hidden">
                {notasLoading ? <Loading /> : notas.length === 0 ? <Empty icon="📄" text="Nenhuma nota fiscal encontrada" /> : (
                  <>
                    <Table>
                      <thead>
                        <tr>
                          <Th>
                            <input
                              type="checkbox"
                              className="accent-orange-500 w-3.5 h-3.5 cursor-pointer align-middle"
                              checked={allVisibleSelected}
                              onChange={(e) => toggleSelectAllNfs(e.target.checked)}
                              title="Selecionar todas visíveis"
                            />
                          </Th>
                          <Th>NF / Série</Th><Th>Emitente</Th><Th>Destinatário</Th><Th>Cidade / UF</Th>
                          <Th>Vol.</Th><Th>Peso</Th><Th>Valor NF</Th><Th>Emissão</Th><Th>Entrega</Th><Th>Status</Th><Th></Th>
                        </tr>
                      </thead>
                      <tbody>
                        {notas.map(nf => (
                          <Tr key={nf.id} onClick={() => nf.entrega && router.push(`/entregas/${nf.entrega.id}`)} className={nf.entrega ? "" : "opacity-70"}>
                            <Td onClick={(ev: any) => ev.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="accent-orange-500 w-3.5 h-3.5 cursor-pointer align-middle"
                                checked={selectedNfIdSet.has(nf.id)}
                                onChange={() => toggleNfSelection(nf)}
                              />
                            </Td>
                            <Td>
                              <div className="font-mono text-sm font-semibold" style={{ color: "var(--accent)" }}>NF {nf.numero}</div>
                              {nf.serie && <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>Série {nf.serie}</div>}
                            </Td>
                            <Td>
                              <div className="text-sm font-medium leading-tight">{nf.emitenteRazao}</div>
                              <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(nf.emitenteCnpj)}</div>
                            </Td>
                            <Td>
                              <div className="text-sm leading-tight">{nf.destinatarioRazao}</div>
                              <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(nf.destinatarioCnpj)}</div>
                            </Td>
                            <Td><span className="text-xs" style={{ color: "var(--text2)" }}>{nf.cidade}{nf.uf ? ` — ${nf.uf}` : ""}</span></Td>
                            <Td><span className="font-mono text-xs">{nf.volumes}</span></Td>
                            <Td><span className="font-mono text-xs" style={{ color: "var(--text2)" }}>{formatWeight(nf.pesoBruto)}</span></Td>
                            <Td><span className="font-mono text-xs" style={{ color: "#10b981" }}>{formatCurrency(nf.valorNota)}</span></Td>
                            <Td><span className="font-mono text-[11px]" style={{ color: "var(--text3)" }}>{formatDate(nf.dataEmissao)}</span></Td>
                            <Td>
                              {nf.entrega ? (
                                <span className="font-mono text-[11px]" style={{ color: "var(--accent)" }}>
                                  {nf.entrega.notas?.length > 0 ? nf.entrega.notas.map((n: any) => n.numero).join(", ") : nf.entrega.codigo}
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: "rgba(239,68,68,.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)" }}>Sem entrega</span>
                              )}
                            </Td>
                            <Td>{nf.entrega ? <StatusBadge status={nf.entrega.status} /> : <span className="text-[10px]" style={{ color: "var(--text3)" }}>—</span>}</Td>
                            <Td>
                              {nf.entrega && (
                                <button onClick={ev => { ev.stopPropagation(); router.push(`/entregas/${nf.entrega.id}`); }}
                                  className="p-1.5 rounded-lg transition-all hover:opacity-70" style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                                  <ExternalLink size={13} />
                                </button>
                              )}
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>

                    {notasPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                        <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>Página {notasPage} de {notasPages} · {notasTotal} registros</span>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" disabled={notasPage === 1} onClick={() => setNotasPage(p => p - 1)}><ChevronLeft size={14} /></Button>
                          <Button variant="ghost" size="sm" disabled={notasPage === notasPages} onClick={() => setNotasPage(p => p + 1)}><ChevronRight size={14} /></Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>

              {/* Barra flutuante — aparece só com NFs selecionadas */}
              {selectedNfIds.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-4 z-50">
                  <span className="text-sm font-bold font-mono">
                    {selectedNfIds.length} NF{selectedNfIds.length !== 1 ? "s" : ""} selecionada{selectedNfIds.length !== 1 ? "s" : ""}
                    <span className="text-slate-400 font-normal"> • {destinatariosSelecionados} destinatário{destinatariosSelecionados !== 1 ? "s" : ""} distinto{destinatariosSelecionados !== 1 ? "s" : ""}</span>
                  </span>
                  <Button size="sm" onClick={handleImprimirFichaConferencia} className="bg-orange-500 hover:bg-orange-600 text-white border-none rounded-full px-4">
                    <Printer size={13} className="mr-1.5" /> Imprimir Ficha de Conferência
                  </Button>
                  <button onClick={() => setSelectedNfs([])} className="w-6 h-6 flex items-center justify-center hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors" title="Limpar seleção">
                    ×
                  </button>
                </div>
              )}
            </>
          )}

          {/* ═══════ TAB: CONSULTA DANFE ═══════ */}
          {tab === "danfe" && (
            <>
              {!danfeData && (
                <div className="max-w-2xl mx-auto space-y-5">
                  <div className="text-center py-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: "rgba(249,115,22,.1)" }}>
                      <Search size={32} style={{ color: "var(--accent)" }} />
                    </div>
                    <h2 className="font-head text-xl font-bold tracking-tight mb-2">Visualizador de DANFE</h2>
                    <p className="text-sm" style={{ color: "var(--text2)" }}>Consulte pela chave de acesso ou faça upload do XML da NF-e</p>
                  </div>

                  <div className="flex rounded-xl p-1 gap-1" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    <button onClick={() => { setDanfeMode("chave"); setDanfeError(null); }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold font-head transition-all"
                      style={danfeMode === "chave" ? { background: "var(--surface)", color: "var(--accent)", boxShadow: "0 1px 3px rgba(0,0,0,.08)" } : { color: "var(--text3)" }}>
                      <Key size={16} /> Chave
                    </button>
                    <button onClick={() => { setDanfeMode("xml"); setDanfeError(null); }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold font-head transition-all"
                      style={danfeMode === "xml" ? { background: "var(--surface)", color: "var(--accent)", boxShadow: "0 1px 3px rgba(0,0,0,.08)" } : { color: "var(--text3)" }}>
                      <Upload size={16} /> Upload XML
                    </button>
                    <button onClick={() => { setDanfeMode("lote"); setDanfeError(null); }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold font-head transition-all"
                      style={danfeMode === "lote" ? { background: "var(--surface)", color: "var(--accent)", boxShadow: "0 1px 3px rgba(0,0,0,.08)" } : { color: "var(--text3)" }}>
                      <PackagePlus size={16} /> Lote (ZIP)
                    </button>
                  </div>

                  {danfeMode === "chave" && (
                    <Card className="space-y-4">
                      <div>
                        <label className="text-xs font-bold font-head mb-2 block" style={{ color: "var(--text2)" }}>Chave de Acesso (44 dígitos)</label>
                        <input type="text" value={chave}
                          onChange={(e) => setChave(e.target.value.replace(/\D/g, "").slice(0, 44))}
                          onKeyDown={(e) => { if (e.key === "Enter" && !danfeLoading) handleConsultaChave(); }}
                          placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
                          className="w-full px-4 py-3 rounded-xl text-sm font-mono tracking-widest outline-none transition-all"
                          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} maxLength={44} autoFocus />
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{chave.length}/44 dígitos</span>
                          {chave.length === 44 && <span className="text-[10px] font-bold" style={{ color: "#059669" }}>Chave completa</span>}
                        </div>
                      </div>
                      <Button onClick={handleConsultaChave} disabled={chave.length !== 44 || danfeLoading} className="w-full" style={{ opacity: chave.length !== 44 || danfeLoading ? 0.5 : 1 }}>
                        {danfeLoading ? <><Loader2 size={16} className="animate-spin" /> Consultando...</> : <><Search size={16} /> Consultar DANFE</>}
                      </Button>
                    </Card>
                  )}

                  {danfeMode === "xml" && (
                    <div onDragOver={(e) => { e.preventDefault(); setDanfeDragging(true); }} onDragLeave={() => setDanfeDragging(false)} onDrop={handleDanfeDrop}
                      className="relative rounded-2xl transition-all cursor-pointer"
                      style={{ border: `2px dashed ${danfeDragging ? "var(--accent)" : "var(--border2)"}`, background: danfeDragging ? "rgba(249,115,22,.05)" : "var(--surface)", minHeight: "220px" }}
                      onClick={() => document.getElementById("danfe-xml-input")?.click()}>
                      <input id="danfe-xml-input" type="file" accept=".xml,text/xml" className="hidden" onChange={handleDanfeFileSelect} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <Upload size={48} className="text-gray-400 mb-2" />
                        <p className="text-gray-600 font-head font-medium">Arraste o arquivo XML aqui ou clique para selecionar</p>
                        <p className="text-sm font-mono" style={{ color: "var(--text3)" }}>Aceita XML de NF-e (procNFe ou NFe)</p>
                        <span className="text-[11px] px-3 py-1 rounded-full font-bold font-mono mt-2" style={{ background: "var(--accent)", color: "white" }}>XML NF-e</span>
                      </div>
                    </div>
                  )}

                  {danfeMode === "lote" && (
                    <Card className="space-y-4">
                      <div>
                        <label className="text-xs font-bold font-head mb-2 block" style={{ color: "var(--text2)" }}>
                          Cole as chaves (uma por linha, ou separadas por qualquer coisa — só os 44 dígitos importam)
                        </label>
                        <textarea value={loteInput}
                          onChange={(e) => setLoteInput(e.target.value)}
                          placeholder={"52250612345678000199550010000000011000000011\n52250612345678000199550010000000021000000022\n..."}
                          className="w-full px-4 py-3 rounded-xl text-xs font-mono outline-none transition-all"
                          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", minHeight: 140 }}
                          disabled={loteRunning || loteZipping} />
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                            {parseChavesFromInput(loteInput).length} chave(s) válida(s) detectada(s) · máx 50 por lote
                          </span>
                          {loteItems.length > 0 && (
                            <button onClick={handleLoteReset} disabled={loteRunning || loteZipping}
                              className="text-[10px] font-bold text-red-500 hover:text-red-700">
                              Limpar
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={handleLotePreview} disabled={loteRunning || loteZipping || parseChavesFromInput(loteInput).length === 0}
                          variant="ghost" className="flex-1">
                          <Search size={14} /> Analisar
                        </Button>
                        <Button onClick={handleRodarLote} disabled={loteRunning || loteZipping || loteItems.length === 0} className="flex-1">
                          {loteRunning ? <><Loader2 size={14} className="animate-spin" /> Consultando...</> : <><PackagePlus size={14} /> Consultar todas</>}
                        </Button>
                      </div>

                      {loteItems.length > 0 && (
                        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                          <div className="max-h-72 overflow-y-auto">
                            {loteItems.map((it, i) => (
                              <div key={it.chave} className="flex items-center gap-2 px-3 py-2 text-xs font-mono border-b" style={{ borderColor: "var(--border)", background: i % 2 ? "var(--surface2)" : "var(--surface)" }}>
                                <span style={{ color: "var(--text3)", width: 24 }}>{i + 1}.</span>
                                <span className="flex-1 truncate" style={{ color: "var(--text2)" }} title={it.chave}>...{it.chave.slice(-14)}</span>
                                {it.status === "pendente" && <span style={{ color: "var(--text3)" }}>—</span>}
                                {it.status === "consultando" && <Loader2 size={13} className="animate-spin" style={{ color: "var(--accent)" }} />}
                                {it.status === "ok" && <span className="flex items-center gap-1" style={{ color: "#10b981" }}><Check size={13} /> OK</span>}
                                {it.status === "erro" && <span className="flex items-center gap-1" style={{ color: "#ef4444" }} title={it.erro}><X size={13} /> Erro</span>}
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between px-3 py-2 text-[11px] font-mono" style={{ background: "var(--surface2)", borderTop: "1px solid var(--border)" }}>
                            <span style={{ color: "var(--text3)" }}>
                              OK: <b style={{ color: "#10b981" }}>{loteItems.filter((it) => it.status === "ok").length}</b> ·
                              Erro: <b style={{ color: "#ef4444" }}>{loteItems.filter((it) => it.status === "erro").length}</b> ·
                              Pendente: <b>{loteItems.filter((it) => it.status === "pendente" || it.status === "consultando").length}</b>
                            </span>
                            <Button onClick={handleBaixarZip} size="sm"
                              disabled={loteZipping || loteRunning || loteItems.filter((it) => it.status === "ok").length === 0}>
                              {loteZipping ? <><Loader2 size={13} className="animate-spin" /> Gerando ZIP...</> : <><Download size={13} /> Baixar ZIP</>}
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  )}

                  {danfeError && (
                    <Card className="flex items-start gap-3" style={{ borderColor: "rgba(239,68,68,.3)" }}>
                      <FileX size={20} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div className="text-sm font-bold text-red-400 mb-1">Erro ao consultar DANFE</div>
                        <div className="text-xs" style={{ color: "var(--text2)" }}>{danfeError}</div>
                      </div>
                    </Card>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { icon: Key, title: "Chave de Acesso", desc: "Consulte com os 44 dígitos" },
                      { icon: Eye, title: "Visualização", desc: "Layout fiel ao DANFE oficial" },
                      { icon: Printer, title: "Impressão", desc: "Imprima direto do navegador" },
                    ].map((f) => (
                      <div key={f.title} className="rounded-xl p-4 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <f.icon size={24} className="mx-auto mb-2" style={{ color: "var(--accent)" }} />
                        <div className="text-xs font-bold font-head">{f.title}</div>
                        <div className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>{f.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {danfeData && (
                <div className="space-y-4 animate-fadeIn">
                  <Card className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <FileText size={18} style={{ color: "var(--accent)" }} />
                      <div>
                        <div className="text-sm font-bold font-head">NF-e {danfeData.numero} · Série {danfeData.serie}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{fileName}</div>
                      </div>
                      {/* Enviar para Avarias — isolado à esquerda, cor âmbar */}
                      {!devolucaoResult ? (
                        <button
                          onClick={() => setShowDevolucaoConfirm(true)}
                          disabled={sendingDevolucao}
                          className="ml-2 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border-2 transition-all hover:bg-amber-50 disabled:opacity-50"
                          style={{ borderColor: "#d97706", color: "#d97706", background: "transparent" }}
                          title="Registrar como NF de devolução em Avarias"
                        >
                          <AlertTriangle size={13} /> Enviar para Avarias
                        </button>
                      ) : (
                        <span className="ml-2 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: "rgba(217,119,6,.12)", color: "#d97706" }}>
                          <Check size={13} />
                          {devolucaoResult === "duplicada" ? "Já em Avarias" : "Enviada para Avarias"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 rounded-lg px-2 py-1" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                        <button onClick={() => setZoom((z) => Math.max(50, z - 10))} className="p-1 rounded hover:opacity-70 transition-all" style={{ color: "var(--text2)" }}><ZoomOut size={14} /></button>
                        <span className="text-[10px] font-mono px-1 min-w-[36px] text-center" style={{ color: "var(--text2)" }}>{zoom}%</span>
                        <button onClick={() => setZoom((z) => Math.min(150, z + 10))} className="p-1 rounded hover:opacity-70 transition-all" style={{ color: "var(--text2)" }}><ZoomIn size={14} /></button>
                      </div>
                      {!danfeImportResult ? (
                        <Button size="sm" onClick={handleAddToEntrega} disabled={danfeImporting} style={{ background: "#059669", borderColor: "#059669" }}>
                          {danfeImporting ? <><Loader2 size={14} className="animate-spin" /> Importando...</> : <><PackagePlus size={14} /> Adicionar à Entrega</>}
                        </Button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: "rgba(5,150,105,.1)", color: "#059669" }}>
                          <Check size={14} />
                          {danfeImportResult.duplicadas > 0 ? "NF-e já importada" : danfeImportResult.agrupadas > 0 ? "Agrupada à entrega" : "Nova entrega criada"}
                        </span>
                      )}
                      <Button variant="ghost" size="sm" onClick={handleDownloadXml}><Download size={14} /> XML</Button>
                      <select
                        value={formatoDanfe}
                        onChange={(e) => setFormatoDanfe(e.target.value as FormatoDanfe)}
                        className="text-xs px-2 py-1.5 rounded-lg outline-none"
                        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                        title="Formato do PDF oficial"
                      >
                        {(Object.keys(ROTULO_FORMATO) as FormatoDanfe[]).map((f) => (
                          <option key={f} value={f}>{ROTULO_FORMATO[f]}</option>
                        ))}
                      </select>
                      <Button variant="ghost" size="sm" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                        {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => window.print()}><Printer size={14} /> Imprimir</Button>
                      <Button variant="ghost" size="sm" onClick={handleDanfeReset}><RotateCcw size={14} /> Novo</Button>
                    </div>
                  </Card>
                  <div className="flex justify-center">
                    <div ref={danfeRef} className="danfe-page-wrapper" style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}>
                      <DanfeViewer data={danfeData} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══════ TAB: NOTAS DE SERVIÇO (NFS-e) ═══════ */}
          {tab === "nfse" && <NfseTab />}

          {/* ═══════ TAB: CT-e ═══════ */}
          {tab === "cte" && <CteTab />}
        </div>
      </div>

      {/* Modal de confirmação — Enviar para Avarias */}
      <Modal
        open={showDevolucaoConfirm}
        onClose={() => setShowDevolucaoConfirm(false)}
        title="Enviar para Avarias e Devoluções?"
        size="md"
      >
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 p-4 rounded-xl"
            style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.3)" }}
          >
            <AlertTriangle size={20} style={{ color: "#d97706", flexShrink: 0, marginTop: 2 }} />
            <div className="text-sm" style={{ color: "var(--text2)" }}>
              Confirma o envio da <strong>NF-e {danfeData?.numero}</strong> para Avarias e Devoluções?
              A nota será registrada como recebida para armazenamento temporário.
            </div>
          </div>
          <div className="text-[11px] p-3 rounded-lg" style={{ background: "var(--surface2)", color: "var(--text3)" }}>
            Se já existir uma devolução <em>PENDENTE</em> do mesmo fornecedor, esta NF será agrupada nela automaticamente.
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowDevolucaoConfirm(false)}>Cancelar</Button>
          <Button
            onClick={handleEnviarParaAvarias}
            disabled={sendingDevolucao}
            style={{ background: "#d97706", borderColor: "#d97706" }}
          >
            {sendingDevolucao ? (
              <><Loader2 size={14} className="animate-spin" /> Enviando...</>
            ) : (
              <><AlertTriangle size={14} /> Confirmar envio</>
            )}
          </Button>
        </div>
      </Modal>
    </>
  );
}
