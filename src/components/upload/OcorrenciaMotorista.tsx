"use client";
import { useState } from "react";
import { obterPosicao } from "@/components/upload/gps";
import { MOTIVOS_MOTORISTA } from "@/lib/ocorrencia-motorista";

async function registrarOcorrencia(token: string, motivo: string, texto: string): Promise<void> {
  const { posicao, gps } = await obterPosicao();
  const res = await fetch(`/api/public/upload/${token}/ocorrencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo, texto, posicao, gps }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.message || data.error || "Não foi possível registrar");
}

/**
 * Ocorrência pelo link do motorista. NÃO muda o status da entrega: a ideia é
 * ele registrar "cliente fechado" e seguir para a próxima parada, voltando
 * depois. Colapsado por padrão para não competir com a ação principal.
 */
export function OcorrenciaMotorista({ token, onRegistrada }: { token: string; onRegistrada?: () => Promise<void> | void }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  async function enviar() {
    if (!motivo) return;
    setErro(null);
    setEnviando(true);
    try {
      await registrarOcorrencia(token, motivo, texto);
      setFeito(true);
      await onRegistrada?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setEnviando(false);
    }
  }

  if (feito) {
    return (
      <div style={{ background: "#052e16", border: "1px solid #166534", padding: "12px 16px", borderRadius: 8, fontSize: 14, color: "#86efac" }}>
        ⚠ Ocorrência registrada. Pode seguir para a próxima parada.
      </div>
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        style={{
          width: "100%", background: "#422006", color: "#fde68a", padding: "14px", borderRadius: 12, border: "1px solid #a16207",
          fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}
      >
        ⚠ Registrar ocorrência
      </button>
    );
  }

  const precisaTexto = motivo === "OUTROS";
  const bloqueado = enviando || !motivo || (precisaTexto && !texto.trim());

  return (
    <div style={{ background: "#111", border: "1px solid #a16207", borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 12, color: "#fde68a", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>
        O que aconteceu?
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {Object.entries(MOTIVOS_MOTORISTA).map(([chave, rotulo]) => {
          const sel = motivo === chave;
          return (
            <button key={chave} type="button" onClick={() => setMotivo(chave)} disabled={enviando}
              style={{
                textAlign: "left", background: sel ? "rgba(249,115,22,.15)" : "#1a1a1a", color: "#fff",
                padding: "12px 14px", borderRadius: 10, border: `2px solid ${sel ? "#f97316" : "#333"}`,
                fontSize: 14, fontWeight: sel ? 700 : 500, cursor: "pointer",
              }}>
              {rotulo}
            </button>
          );
        })}
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={precisaTexto ? "Descreva o que aconteceu (obrigatório)" : "Detalhe (opcional)"}
        rows={3}
        maxLength={500}
        disabled={enviando}
        style={{
          width: "100%", marginTop: 10, background: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 10,
          padding: 12, fontSize: 14, fontFamily: "inherit", resize: "none", boxSizing: "border-box",
        }}
      />
      {erro && (
        <div style={{ background: "#7f1d1d", padding: "10px 14px", borderRadius: 8, marginTop: 10, fontSize: 13, color: "#fecaca" }}>❌ {erro}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 12 }}>
        <button type="button" onClick={() => setAberto(false)} disabled={enviando}
          style={{ background: "#222", color: "#fff", padding: "14px", borderRadius: 12, border: "1px solid #333", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Cancelar
        </button>
        <button type="button" onClick={enviar} disabled={bloqueado}
          style={{
            background: "#f97316", color: "#fff", padding: "14px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700,
            cursor: "pointer", opacity: bloqueado ? 0.5 : 1,
          }}>
          {enviando ? "Registrando…" : "Registrar"}
        </button>
      </div>
    </div>
  );
}
