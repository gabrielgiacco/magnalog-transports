"use client";

import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card } from "@/components/ui";
import { DanfeViewer } from "@/components/danfe/DanfeViewer";
import { DanfeData, parseDanfeXML } from "@/lib/danfe-parser";
import { baixarDanfePDF } from "@/lib/danfe-pdf";
import {
  Upload,
  FileText,
  Printer,
  Download,
  RotateCcw,
  Search,
  FileX,
  Eye,
  ZoomIn,
  ZoomOut,
  Key,
  Loader2,
  PackagePlus,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Modal } from "@/components/ui";

type InputMode = "chave" | "xml";

export default function ConsultaDanfePage() {
  const [mode, setMode] = useState<InputMode>("chave");
  const [dragging, setDragging] = useState(false);
  const [danfeData, setDanfeData] = useState<DanfeData | null>(null);
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [chave, setChave] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ importadas: number; agrupadas: number; duplicadas: number } | null>(null);
  const [showDevolucaoConfirm, setShowDevolucaoConfirm] = useState(false);
  const [sendingDevolucao, setSendingDevolucao] = useState(false);
  const [devolucaoResult, setDevolucaoResult] = useState<"nova" | "duplicada" | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const danfeRef = useRef<HTMLDivElement>(null);

  const processXml = useCallback((content: string, name: string) => {
    try {
      const parsed = parseDanfeXML(content);
      setXmlContent(content);
      setFileName(name);
      setDanfeData(parsed);
      setError(null);
      toast.success("DANFE carregado com sucesso!");
    } catch (e: any) {
      setError(e.message || "Erro ao processar o XML");
      toast.error("Erro ao processar XML");
    }
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setDanfeData(null);

      if (!file.name.toLowerCase().endsWith(".xml")) {
        setError("Por favor, selecione um arquivo XML de NF-e.");
        return;
      }

      const content = await file.text();
      processXml(content, file.name);
    },
    [processXml]
  );

  async function handleConsultaChave() {
    const clean = chave.replace(/\s/g, "");
    if (!/^\d{44}$/.test(clean)) {
      setError("A chave de acesso deve conter exatamente 44 dígitos numéricos.");
      toast.error("Chave de acesso inválida");
      return;
    }

    setError(null);
    setDanfeData(null);
    setLoading(true);

    try {
      const res = await fetch("/api/consulta-danfe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: clean }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao consultar NF-e.");
        toast.error(data.error || "Erro ao consultar NF-e");
        return;
      }

      processXml(data.xml, `NFe_${clean}.xml`);
    } catch (e: any) {
      setError("Erro de conexão ao consultar NF-e.");
      toast.error("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  function handlePrint() {
    window.print();
  }

  function handleDownloadXml() {
    if (!xmlContent || !fileName) return;
    const blob = new Blob([xmlContent], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownloadPdf() {
    const el = document.getElementById("danfe-print");
    if (!el || !danfeData) return;
    setDownloadingPdf(true);
    try {
      const nome = `DANFE_${danfeData.numero || "nfe"}_${danfeData.serie || ""}`;
      await baixarDanfePDF(el as HTMLElement, nome);
      toast.success("PDF gerado!");
    } catch {
      toast.error("Erro ao gerar PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleAddToEntrega() {
    if (!xmlContent) return;
    setImporting(true);
    try {
      const blob = new Blob([xmlContent], { type: "text/xml" });
      const file = new File([blob], fileName || "nfe.xml", { type: "text/xml" });
      const formData = new FormData();
      formData.append("files", file);

      const res = await fetch("/api/importacao", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao importar NF-e");
        return;
      }

      setImportResult({ importadas: data.importadas, agrupadas: data.agrupadas, duplicadas: data.duplicadas });

      if (data.duplicadas > 0) {
        toast("NF-e já importada anteriormente", { icon: "⚠️" });
      } else if (data.agrupadas > 0) {
        toast.success("NF-e agrupada a uma entrega existente!");
      } else if (data.importadas > 0) {
        toast.success("NF-e importada e nova entrega criada!");
      }
    } catch {
      toast.error("Erro ao importar NF-e");
    } finally {
      setImporting(false);
    }
  }

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

      if (!res.ok) {
        toast.error(data.error || "Erro ao enviar para Avarias");
        return;
      }

      if (data.duplicadas > 0) {
        setDevolucaoResult("duplicada");
        toast("NF já registrada em Avarias", { icon: "⚠️" });
      } else if (data.importadas > 0) {
        setDevolucaoResult("nova");
        toast.success("NF enviada para Avarias e Devoluções!");
      }
      setShowDevolucaoConfirm(false);
    } catch {
      toast.error("Erro ao enviar para Avarias");
    } finally {
      setSendingDevolucao(false);
    }
  }

  function handleReset() {
    setDanfeData(null);
    setXmlContent(null);
    setFileName("");
    setError(null);
    setZoom(100);
    setChave("");
    setImportResult(null);
    setDevolucaoResult(null);
  }

  return (
    <>
      <Topbar
        title="Consulta DANFE"
        subtitle="Visualize e imprima o DANFE a partir da chave de acesso ou XML"
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Input area - shown when no data */}
        {!danfeData && (
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Hero */}
            <div className="text-center py-4">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                style={{ background: "rgba(249,115,22,.1)" }}
              >
                <Search size={32} style={{ color: "var(--accent)" }} />
              </div>
              <h2 className="font-head text-xl font-bold tracking-tight mb-2">
                Visualizador de DANFE
              </h2>
              <p className="text-sm" style={{ color: "var(--text2)" }}>
                Consulte pela chave de acesso ou faça upload do XML da NF-e
              </p>
            </div>

            {/* Mode Tabs */}
            <div
              className="flex rounded-xl p-1 gap-1"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
            >
              <button
                onClick={() => { setMode("chave"); setError(null); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold font-head transition-all"
                style={
                  mode === "chave"
                    ? { background: "var(--surface)", color: "var(--accent)", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }
                    : { color: "var(--text3)" }
                }
              >
                <Key size={16} />
                Chave de Acesso
              </button>
              <button
                onClick={() => { setMode("xml"); setError(null); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold font-head transition-all"
                style={
                  mode === "xml"
                    ? { background: "var(--surface)", color: "var(--accent)", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }
                    : { color: "var(--text3)" }
                }
              >
                <Upload size={16} />
                Upload XML
              </button>
            </div>

            {/* Chave de Acesso Input */}
            {mode === "chave" && (
              <Card className="space-y-4">
                <div>
                  <label className="text-xs font-bold font-head mb-2 block" style={{ color: "var(--text2)" }}>
                    Chave de Acesso (44 dígitos)
                  </label>
                  <input
                    type="text"
                    value={chave}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 44);
                      setChave(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !loading) handleConsultaChave();
                    }}
                    placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
                    className="w-full px-4 py-3 rounded-xl text-sm font-mono tracking-widest outline-none transition-all"
                    style={{
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                    maxLength={44}
                    autoFocus
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                      {chave.length}/44 dígitos
                    </span>
                    {chave.length === 44 && (
                      <span className="text-[10px] font-bold" style={{ color: "#059669" }}>
                        Chave completa
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  onClick={handleConsultaChave}
                  disabled={chave.length !== 44 || loading}
                  className="w-full"
                  style={{
                    opacity: chave.length !== 44 || loading ? 0.5 : 1,
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Consultando...
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      Consultar DANFE
                    </>
                  )}
                </Button>
              </Card>
            )}

            {/* XML Upload */}
            {mode === "xml" && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className="relative rounded-2xl transition-all cursor-pointer"
                style={{
                  border: `2px dashed ${dragging ? "var(--accent)" : "var(--border2)"}`,
                  background: dragging ? "rgba(249,115,22,.05)" : "var(--surface)",
                  minHeight: "220px",
                }}
                onClick={() =>
                  document.getElementById("danfe-xml-input")?.click()
                }
              >
                <input
                  id="danfe-xml-input"
                  type="file"
                  accept=".xml,text/xml"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Upload size={48} className="text-gray-400 mb-2" />
                  <p className="text-gray-600 font-head font-medium">
                    Arraste o arquivo XML aqui ou clique para selecionar
                  </p>
                  <p
                    className="text-sm font-mono"
                    style={{ color: "var(--text3)" }}
                  >
                    Aceita XML de NF-e (procNFe ou NFe)
                  </p>
                  <span
                    className="text-[11px] px-3 py-1 rounded-full font-bold font-mono mt-2"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    XML NF-e
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <Card
                className="flex items-start gap-3"
                style={{ borderColor: "rgba(239,68,68,.3)" }}
              >
                <FileX
                  size={20}
                  style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <div className="text-sm font-bold text-red-400 mb-1">
                    Erro ao consultar DANFE
                  </div>
                  <div className="text-xs" style={{ color: "var(--text2)" }}>
                    {error}
                  </div>
                </div>
              </Card>
            )}

            {/* Features */}
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  icon: Key,
                  title: "Chave de Acesso",
                  desc: "Consulte com os 44 dígitos",
                },
                {
                  icon: Eye,
                  title: "Visualização",
                  desc: "Layout fiel ao DANFE oficial",
                },
                {
                  icon: Printer,
                  title: "Impressão",
                  desc: "Imprima direto do navegador",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl p-4 text-center"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <f.icon
                    size={24}
                    className="mx-auto mb-2"
                    style={{ color: "var(--accent)" }}
                  />
                  <div className="text-xs font-bold font-head">{f.title}</div>
                  <div
                    className="text-[10px] mt-1"
                    style={{ color: "var(--text3)" }}
                  >
                    {f.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DANFE Viewer */}
        {danfeData && (
          <div className="space-y-4 animate-fadeIn">
            {/* Toolbar */}
            <Card className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <FileText size={18} style={{ color: "var(--accent)" }} />
                <div>
                  <div className="text-sm font-bold font-head">
                    NF-e {danfeData.numero} · Série {danfeData.serie}
                  </div>
                  <div
                    className="text-[10px] font-mono"
                    style={{ color: "var(--text3)" }}
                  >
                    {fileName}
                  </div>
                </div>
                {/* Botão de Devolução — isolado à esquerda, cor âmbar, longe do "Adicionar à Entrega" */}
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
                  <span
                    className="ml-2 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg"
                    style={{ background: "rgba(217,119,6,.12)", color: "#d97706" }}
                  >
                    <Check size={13} />
                    {devolucaoResult === "duplicada" ? "Já em Avarias" : "Enviada para Avarias"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Zoom controls */}
                <div
                  className="flex items-center gap-1 rounded-lg px-2 py-1"
                  style={{
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <button
                    onClick={() => setZoom((z) => Math.max(50, z - 10))}
                    className="p-1 rounded hover:opacity-70 transition-all"
                    style={{ color: "var(--text2)" }}
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span
                    className="text-[10px] font-mono px-1 min-w-[36px] text-center"
                    style={{ color: "var(--text2)" }}
                  >
                    {zoom}%
                  </span>
                  <button
                    onClick={() => setZoom((z) => Math.min(150, z + 10))}
                    className="p-1 rounded hover:opacity-70 transition-all"
                    style={{ color: "var(--text2)" }}
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>

                {!importResult ? (
                  <Button
                    size="sm"
                    onClick={handleAddToEntrega}
                    disabled={importing}
                    style={{ background: "#059669", borderColor: "#059669" }}
                  >
                    {importing ? (
                      <><Loader2 size={14} className="animate-spin" /> Importando...</>
                    ) : (
                      <><PackagePlus size={14} /> Adicionar à Entrega</>
                    )}
                  </Button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: "rgba(5,150,105,.1)", color: "#059669" }}>
                    <Check size={14} />
                    {importResult.duplicadas > 0
                      ? "NF-e já importada"
                      : importResult.agrupadas > 0
                      ? "Agrupada à entrega"
                      : "Nova entrega criada"}
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={handleDownloadXml}>
                  <Download size={14} /> XML
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                  {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
                </Button>
                <Button variant="ghost" size="sm" onClick={handlePrint}>
                  <Printer size={14} /> Imprimir
                </Button>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RotateCcw size={14} /> Novo
                </Button>
              </div>
            </Card>

            {/* DANFE Document */}
            <div className="flex justify-center">
              <div
                ref={danfeRef}
                className="danfe-page-wrapper"
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "top center",
                }}
              >
                <DanfeViewer data={danfeData} />
              </div>
            </div>
          </div>
        )}

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
            <div
              className="text-[11px] p-3 rounded-lg"
              style={{ background: "var(--surface2)", color: "var(--text3)" }}
            >
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
      </div>
    </>
  );
}
