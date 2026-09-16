"use client";
import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { Button, Modal } from "@/components/ui";
import { Copy, RefreshCw, Trash2, MessageCircle, Smartphone, Clock } from "lucide-react";
import { linkWhatsApp } from "@/lib/telefone";

// Mesmo modal para os dois links. O que muda entre eles cabe nesta tabela.
const MODOS = {
  entrega: {
    api: "/api/entregas",
    path: "/upload",
    titulo: "Link para o Motorista",
    texto: "Gere um link único pro motorista subir o canhoto pelo celular. Sem login, sem cadastro — ele só abre no navegador e tira foto.",
    vazio: "Nenhum link ativo pra esta entrega.",
    msg: (codigo: string, link: string) => `Para enviar o canhoto da entrega ${codigo}, acesse: ${link}`,
  },
  rota: {
    api: "/api/rotas",
    path: "/rota",
    titulo: "Link da Rota para o Motorista",
    texto: "Um link só com todas as paradas: endereço, mapa, NFs, canhoto e ocorrência. Sem login. Revogar aqui revoga também os links das entregas desta rota.",
    vazio: "Nenhum link ativo pra esta rota.",
    msg: (codigo: string, link: string) => `Suas entregas da rota ${codigo} estão aqui: ${link}`,
  },
} as const;

interface Props {
  open: boolean;
  onClose: () => void;
  modo?: keyof typeof MODOS;
  id: string;
  codigo: string;
  motoristaTelefone?: string | null;
  motoristaNome?: string | null;
}

export function LinkMotoristaModal({ open, onClose, modo = "entrega", id, codigo, motoristaTelefone, motoristaNome }: Props) {
  const m = MODOS[modo];
  const [token, setToken] = useState<string | null>(null);
  const [expira, setExpira] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const link = token ? `${typeof window !== "undefined" ? window.location.origin : ""}${m.path}/${token}` : "";

  const fetchToken = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${m.api}/${id}/upload-token`);
      const d = await r.json();
      setToken(d.token);
      setExpira(d.expira);
    } finally { setLoading(false); }
  }, [id, m.api]);

  useEffect(() => { if (open) fetchToken(); }, [open, fetchToken]);

  useEffect(() => {
    if (link) {
      QRCode.toDataURL(link, { width: 240, margin: 1, color: { dark: "#000", light: "#fff" } })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else setQrDataUrl(null);
  }, [link]);

  async function gerarNovo() {
    setLoading(true);
    try {
      const r = await fetch(`${m.api}/${id}/upload-token`, { method: "POST" });
      const d = await r.json();
      setToken(d.token);
      setExpira(d.expira);
      toast.success("Novo link gerado (48h)");
    } finally { setLoading(false); }
  }

  async function revogar() {
    if (!window.confirm("Revogar o link atual? Motorista não conseguirá mais usar.")) return;
    setLoading(true);
    try {
      await fetch(`${m.api}/${id}/upload-token`, { method: "DELETE" });
      setToken(null); setExpira(null);
      toast.success("Link revogado");
    } finally { setLoading(false); }
  }

  function copiar() {
    navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  }

  function enviarWhatsApp() {
    const msg = `Olá${motoristaNome ? ` ${motoristaNome.split(" ")[0]}` : ""}! ` + m.msg(codigo, link);
    window.open(linkWhatsApp(motoristaTelefone, msg), "_blank");
  }

  const horasRestantes = expira ? Math.floor((new Date(expira).getTime() - Date.now()) / (60 * 60 * 1000)) : 0;

  return (
    <Modal open={open} onClose={onClose} title={m.titulo} size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.2)" }}>
          <Smartphone size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm" style={{ color: "var(--text2)" }}>{m.texto}</p>
        </div>

        {loading && !token ? (
          <div className="text-center py-8 text-sm" style={{ color: "var(--text3)" }}>Carregando...</div>
        ) : !token ? (
          <div className="text-center py-6">
            <p className="text-sm mb-4" style={{ color: "var(--text2)" }}>{m.vazio}</p>
            <Button onClick={gerarNovo} loading={loading}>
              <Smartphone size={14} /> Gerar link (válido 48h)
            </Button>
          </div>
        ) : (
          <>
            {qrDataUrl && (
              <div className="flex justify-center">
                <img src={qrDataUrl} alt="QR Code" className="rounded-xl border" style={{ borderColor: "var(--border)", background: "white", padding: 8 }} />
              </div>
            )}

            <div className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <div className="text-[10px] font-mono uppercase font-bold mb-1" style={{ color: "var(--text3)" }}>Link</div>
              <div className="text-xs font-mono break-all" style={{ color: "var(--accent)" }}>{link}</div>
            </div>

            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text3)" }}>
              <Clock size={12} />
              Expira em {horasRestantes}h ({new Date(expira!).toLocaleString("pt-BR")})
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" size="sm" onClick={copiar}>
                <Copy size={13} /> Copiar link
              </Button>
              <Button size="sm" onClick={enviarWhatsApp} style={{ background: "#25d366", borderColor: "#25d366" }}>
                <MessageCircle size={13} /> {motoristaTelefone ? "Enviar WhatsApp" : "WhatsApp (escolher)"}
              </Button>
            </div>

            <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: "var(--border)" }}>
              <button onClick={revogar} className="text-xs flex items-center gap-1 text-rose-500 hover:opacity-70">
                <Trash2 size={12} /> Revogar
              </button>
              <button onClick={gerarNovo} className="text-xs flex items-center gap-1" style={{ color: "var(--text2)" }}>
                <RefreshCw size={12} /> Gerar novo
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
