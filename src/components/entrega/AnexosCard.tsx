"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Upload, FileText, Image as ImageIcon, Trash2, Download, Loader2, Paperclip, X } from "lucide-react";

interface Anexo {
  id: string;
  tipo: string;
  filename: string;
  mimeType: string;
  size: number;
  descricao: string | null;
  url: string;
  createdAt: string;
  uploadadoPor?: { id: string; name: string | null } | null;
}

const TIPO_LABEL: Record<string, string> = {
  CANHOTO: "Canhoto",
  FOTO: "Foto",
  DOCUMENTO: "Documento",
  CNH: "CNH",
  CRLV: "CRLV",
  ANTT: "ANTT",
  SEGURO: "Seguro",
  CONTRATO: "Contrato",
  OUTRO: "Outro",
};

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface AnexosCardProps {
  /** Prefixo do endpoint. Deve responder GET (lista), POST (presign), PUT (confirm), DELETE /[id] */
  apiBase?: string;
  /** Legado — se passar entregaId, monta apiBase automaticamente */
  entregaId?: string;
  /** Tipos permitidos no dropdown (default: todos) */
  tiposPermitidos?: string[];
  /** Tipo default selecionado no dropdown */
  tipoDefault?: string;
  /** Título do card */
  titulo?: string;
  readOnly?: boolean;
}

export function AnexosCard({
  apiBase: apiBaseProp,
  entregaId,
  tiposPermitidos,
  tipoDefault,
  titulo = "Canhotos & Anexos",
  readOnly = false,
}: AnexosCardProps) {
  const apiBase = apiBaseProp || (entregaId ? `/api/entregas/${entregaId}/anexos` : "");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tipoUpload, setTipoUpload] = useState(tipoDefault || "CANHOTO");
  const [preview, setPreview] = useState<Anexo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tiposDisponiveis = tiposPermitidos && tiposPermitidos.length
    ? tiposPermitidos
    : Object.keys(TIPO_LABEL);

  const fetchAnexos = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    try {
      const res = await fetch(apiBase);
      if (res.ok) setAnexos(await res.json());
    } finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => { fetchAnexos(); }, [fetchAnexos]);

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error(`${file.name}: excede 15MB`);
      return;
    }
    const t = toast.loading(`Enviando ${file.name}...`);
    try {
      // 1) Pede URL presignada
      const presignRes = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size }),
      });
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao gerar URL");
      }
      const { uploadUrl, objectKey } = await presignRes.json();

      // 2) Upload direto no R2 (bypass Vercel)
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Falha no upload ao R2");

      // 3) Confirma no DB
      const confirmRes = await fetch(apiBase, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          tipo: tipoUpload,
        }),
      });
      if (!confirmRes.ok) throw new Error("Falha ao registrar anexo");

      const novo = await confirmRes.json();
      setAnexos((prev) => [novo, ...prev]);
      toast.success("Anexo enviado", { id: t });
    } catch (e: any) {
      toast.error(e.message || "Erro no upload", { id: t });
    }
  }, [apiBase, tipoUpload]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) await uploadFile(f);
    } finally { setUploading(false); }
  }, [uploadFile]);

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir este anexo?")) return;
    try {
      const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAnexos((prev) => prev.filter((a) => a.id !== id));
      toast.success("Anexo excluído");
    } catch { toast.error("Erro ao excluir"); }
  }

  return (
    <div className="rounded-2xl p-4 sm:p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Paperclip size={14} className="text-[var(--accent)]" />
          <h3 className="text-xs uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>
            {titulo}
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: "var(--surface2)", color: "var(--text3)" }}>
            {anexos.length}
          </span>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <select
              value={tipoUpload}
              onChange={(e) => setTipoUpload(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg outline-none"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              {tiposDisponiveis.map((k) => <option key={k} value={k}>{TIPO_LABEL[k] || k}</option>)}
            </select>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: "var(--accent)", color: "white", opacity: uploading ? 0.6 : 1 }}
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              Enviar
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />
          </div>
        )}
      </div>

      {!readOnly && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl mb-4 cursor-pointer transition-all py-6 flex flex-col items-center justify-center gap-1 text-center"
          style={{
            border: `2px dashed ${dragging ? "var(--accent)" : "var(--border2)"}`,
            background: dragging ? "rgba(249,115,22,.05)" : "var(--surface2)",
          }}
        >
          <Upload size={22} style={{ color: "var(--text3)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text2)" }}>
            Arraste imagens/PDFs aqui ou clique para selecionar
          </p>
          <p className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
            JPG, PNG, WEBP, PDF · até 15MB por arquivo
          </p>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-xs" style={{ color: "var(--text3)" }}>Carregando anexos...</div>
      ) : anexos.length === 0 ? (
        <div className="py-8 text-center">
          <FileText size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs" style={{ color: "var(--text3)" }}>Nenhum anexo enviado ainda</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {anexos.map((a) => {
            const isImage = a.mimeType.startsWith("image/");
            return (
              <div key={a.id} className="rounded-xl overflow-hidden group relative" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <button onClick={() => setPreview(a)} className="block w-full aspect-[4/3] overflow-hidden" style={{ background: "var(--bg)" }}>
                  {isImage ? (
                    <img src={a.url} alt={a.filename} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1" style={{ color: "var(--text3)" }}>
                      <FileText size={28} />
                      <span className="text-[10px] font-mono uppercase">PDF</span>
                    </div>
                  )}
                </button>
                <div className="p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: "rgba(249,115,22,.15)", color: "var(--accent)" }}>
                      {TIPO_LABEL[a.tipo] || a.tipo}
                    </span>
                  </div>
                  <div className="text-[11px] truncate" title={a.filename} style={{ color: "var(--text)" }}>{a.filename}</div>
                  <div className="text-[9px] mt-0.5 flex items-center justify-between" style={{ color: "var(--text3)" }}>
                    <span>{fmtSize(a.size)}</span>
                    <div className="flex items-center gap-1">
                      <a href={a.url} download={a.filename} onClick={(e) => e.stopPropagation()} className="p-1 rounded hover:opacity-70" title="Baixar">
                        <Download size={11} />
                      </a>
                      {!readOnly && (
                        <button onClick={() => handleDelete(a.id)} className="p-1 rounded text-rose-500 hover:opacity-70" title="Excluir">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.85)" }} onClick={() => setPreview(null)}>
          <button onClick={() => setPreview(null)} className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white">
            <X size={20} />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-5xl w-full max-h-[90vh] flex items-center justify-center">
            {preview.mimeType.startsWith("image/") ? (
              <img src={preview.url} alt={preview.filename} className="max-w-full max-h-[90vh] object-contain rounded-lg" />
            ) : (
              <iframe src={preview.url} title={preview.filename} className="w-full h-[90vh] rounded-lg bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
