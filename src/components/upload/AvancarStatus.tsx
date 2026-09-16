"use client";
import { useState } from "react";
import { AssinaturaPad } from "@/components/upload/AssinaturaPad";
import { obterPosicao } from "@/components/upload/gps";

const card = (cor: string, borda: string) => ({
  background: cor, border: `1px solid ${borda}`, borderRadius: 12, padding: 16, marginBottom: 16,
});

/** Devolve true quando a tela precisa recarregar (409 = estado desatualizado). Lança em erro. */
async function postStatus(token: string, para: "EM_ROTA" | "ENTREGUE"): Promise<void> {
  const { posicao, gps } = await obterPosicao();
  const res = await fetch(`/api/public/upload/${token}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ para, posicao, gps }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.message || data.error || "Não foi possível avançar");
}

// Mesma dança de 3 chamadas do upload de foto, com o tipo ASSINATURA.
async function enviarAssinatura(token: string, codigo: string, blob: Blob): Promise<void> {
  const filename = `assinatura_${codigo}_${Date.now()}.png`;
  const presign = await fetch(`/api/public/upload/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, mimeType: "image/png", size: blob.size }),
  });
  if (!presign.ok) throw new Error("Falha ao preparar o envio da assinatura");
  const { uploadUrl, objectKey } = await presign.json();

  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: blob });
  if (!put.ok) throw new Error("Falha ao enviar a assinatura");

  const confirm = await fetch(`/api/public/upload/${token}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey, filename, mimeType: "image/png", size: blob.size, tipo: "ASSINATURA" }),
  });
  if (!confirm.ok) throw new Error("Falha ao registrar a assinatura");
}

/** Estados em que o motorista não age: só informam. Sem estado, sem rede. */
function CartaoEstatico({ status, dataEntrega }: { status: string; dataEntrega: string | null }) {
  if (status === "PROGRAMADO" || status === "EM_SEPARACAO") {
    return (
      <div style={card("#111", "#222")}>
        <div style={{ fontSize: 14, color: "#aaa" }}>📦 Aguardando carregamento no depósito</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>O pessoal da Magna Log atualiza esta etapa.</div>
      </div>
    );
  }
  if (status === "ENTREGUE" || status === "FINALIZADO") {
    return (
      <div style={card("#052e16", "#166534")}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#86efac" }}>✅ Entrega concluída</div>
        {dataEntrega && (
          <div style={{ fontSize: 12, color: "#4ade80", marginTop: 4 }}>{new Date(dataEntrega).toLocaleString("pt-BR")}</div>
        )}
      </div>
    );
  }
  if (status === "OCORRENCIA") {
    return (
      <div style={card("#7f1d1d", "#991b1b")}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fecaca" }}>⚠️ Entrega com ocorrência</div>
        <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 4 }}>Fale com a Magna Log antes de continuar.</div>
      </div>
    );
  }
  return null;
}

export function AvancarStatus({ token, status, codigo, temCanhoto, dataEntrega, onAtualizado }: {
  token: string;
  status: string;
  codigo: string;
  temCanhoto: boolean;
  dataEntrega: string | null;
  onAtualizado: () => Promise<void>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Em qualquer desfecho recarrega: sucesso mostra o novo estado, erro 409
  // mostra o estado real que a tela não tinha.
  async function executar(passo: () => Promise<void>, rotulo: string) {
    setErro(null);
    setEnviando(true);
    setProgresso(rotulo);
    try {
      await passo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setEnviando(false);
      setProgresso(null);
      await onAtualizado();
    }
  }

  const iniciarRota = () => executar(() => postStatus(token, "EM_ROTA"), "Registrando saída…");

  function concluir(blob: Blob) {
    if (!window.confirm("Confirmar que a entrega foi realizada? Isso avisa a Magna Log.")) return;
    executar(async () => {
      await enviarAssinatura(token, codigo, blob);
      setProgresso("Confirmando entrega…");
      await postStatus(token, "ENTREGUE");
    }, "Enviando assinatura…");
  }

  const aviso = (texto: string) => (
    <div style={{ background: "#7f1d1d", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14, color: "#fecaca" }}>❌ {texto}</div>
  );
  const andamento = progresso && (
    <div style={{ background: "#1e293b", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14, textAlign: "center" }}>⏳ {progresso}</div>
  );

  if (status !== "CARREGADO" && status !== "EM_ROTA") {
    return <CartaoEstatico status={status} dataEntrega={dataEntrega} />;
  }

  if (status === "CARREGADO") {
    return (
      <div style={{ marginBottom: 16 }}>
        {erro && aviso(erro)}
        {andamento}
        <button
          onClick={iniciarRota}
          disabled={enviando}
          style={{
            width: "100%", background: "#f97316", color: "#fff", padding: "20px", borderRadius: 12, border: "none",
            fontSize: 18, fontWeight: 700, cursor: "pointer", opacity: enviando ? 0.6 : 1,
          }}
        >
          🚚 Iniciar rota
        </button>
      </div>
    );
  }

  // EM_ROTA
  return (
    <div style={card("#111", "#f97316")}>
      <div style={{ fontSize: 12, color: "#f97316", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>
        Confirmar entrega
      </div>
      {erro && aviso(erro)}
      {andamento}
      {temCanhoto ? (
        <AssinaturaPad onConfirmar={concluir} disabled={enviando} />
      ) : (
        <div style={{ background: "#422006", border: "1px solid #a16207", padding: "12px 16px", borderRadius: 8, fontSize: 14, color: "#fde68a" }}>
          📷 Tire a foto do canhoto abaixo para liberar a confirmação.
        </div>
      )}
    </div>
  );
}
