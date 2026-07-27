"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";

interface Info {
  entrega: {
    id: string;
    codigo: string;
    razaoSocial: string;
    cidade: string;
    uf: string | null;
    dataAgendada: string | null;
    statusCanhoto: string;
    notas: { numero: string; emitenteRazao: string }[];
    motorista: { nome: string } | null;
  };
  anexos: { id: string; filename: string; mimeType: string; size: number; url: string; createdAt: string }[];
  expira: string;
}

const MAX_MB = 15;

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadPublicPage() {
  const params = useParams();
  const token = params!.token as string;
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/public/upload/${token}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErro(j.error || "Link inválido ou expirado");
      } else {
        setInfo(await r.json());
      }
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  async function uploadFile(file: File) {
    setErroUpload(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setErroUpload(`${file.name}: excede ${MAX_MB}MB`);
      return;
    }
    setProgress(`Enviando ${file.name}...`);
    try {
      const presignRes = await fetch(`/api/public/upload/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size }),
      });
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao gerar URL");
      }
      const { uploadUrl, objectKey } = await presignRes.json();

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Falha no upload");

      const confirmRes = await fetch(`/api/public/upload/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });
      if (!confirmRes.ok) throw new Error("Falha ao registrar");

      setProgress(null);
      await fetchInfo(); // recarrega lista
    } catch (e: any) {
      setErroUpload(e.message || "Erro no upload");
      setProgress(null);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) await uploadFile(f);
    } finally { setUploading(false); }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#fff" }}>
        <div>Carregando...</div>
      </div>
    );
  }

  if (erro || !info) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#fff", padding: "20px" }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{erro || "Link inválido"}</h1>
          <p style={{ fontSize: 14, color: "#888" }}>
            Este link não é mais válido. Peça um novo link ao pessoal da Magna Log.
          </p>
        </div>
      </div>
    );
  }

  const { entrega, anexos, expira } = info;
  const nfs = entrega.notas.map((n) => n.numero).join(", ");
  const emitentes = Array.from(new Set(entrega.notas.map((n) => n.emitenteRazao))).join(" · ");
  const expiraDate = new Date(expira);
  const horasRestantes = Math.floor((expiraDate.getTime() - Date.now()) / (60 * 60 * 1000));

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#f97316", padding: "16px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 700, letterSpacing: 1 }}>MAGNA LOG</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>Enviar Canhoto</div>
      </div>

      <div style={{ maxWidth: 500, margin: "0 auto", padding: "20px 16px 60px" }}>
        {/* Dados da entrega */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Entrega {entrega.codigo}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{entrega.razaoSocial}</div>
          <div style={{ fontSize: 14, color: "#aaa", marginBottom: 12 }}>
            📍 {entrega.cidade}{entrega.uf ? ` — ${entrega.uf}` : ""}
          </div>
          {nfs && (
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: "#888" }}>NF: </span>
              <span style={{ fontFamily: "monospace", color: "#f97316", fontWeight: 700 }}>{nfs}</span>
            </div>
          )}
          {emitentes && <div style={{ fontSize: 12, color: "#888" }}>Fornecedor: {emitentes}</div>}
          {entrega.motorista && <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Motorista: {entrega.motorista.nome}</div>}
          <div style={{ fontSize: 10, color: "#666", marginTop: 12, paddingTop: 12, borderTop: "1px solid #222" }}>
            ⏱ Link válido por mais {horasRestantes > 0 ? `${horasRestantes}h` : "menos de 1h"}
          </div>
        </div>

        {/* Botões de upload */}
        <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            style={{
              background: "#f97316", color: "#fff", padding: "18px 20px", borderRadius: 12, border: "none",
              fontSize: 16, fontWeight: 700, cursor: "pointer", opacity: uploading ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            📷 {uploading ? "Enviando..." : "Tirar foto do canhoto"}
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />

          <button
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploading}
            style={{
              background: "#222", color: "#fff", padding: "14px 20px", borderRadius: 12, border: "1px solid #333",
              fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: uploading ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            🖼 Escolher da galeria / PDF
          </button>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        {progress && (
          <div style={{ background: "#1e293b", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14, textAlign: "center" }}>
            ⏳ {progress}
          </div>
        )}
        {erroUpload && (
          <div style={{ background: "#7f1d1d", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14, color: "#fecaca" }}>
            ❌ {erroUpload}
          </div>
        )}

        {/* Anexos enviados */}
        {anexos.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontWeight: 700 }}>
              ✅ Canhotos enviados ({anexos.length})
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {anexos.map((a) => (
                <div key={a.id} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
                  {a.mimeType.startsWith("image/") ? (
                    <img src={a.url} alt={a.filename} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, background: "#000" }} />
                  ) : (
                    <div style={{ width: 60, height: 60, borderRadius: 6, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📄</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, wordBreak: "break-word" }}>{a.filename}</div>
                    <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                      {fmtSize(a.size)} · {new Date(a.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {anexos.length === 0 && !uploading && (
          <div style={{ textAlign: "center", padding: "24px 16px", color: "#666", fontSize: 13 }}>
            Nenhum canhoto enviado ainda. Toque em "Tirar foto do canhoto" acima.
          </div>
        )}
      </div>
    </div>
  );
}
