"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ParadaCard, type Parada } from "@/components/upload/ParadaCard";
import { obterPosicao } from "@/components/upload/gps";

interface Info {
  rota: { codigo: string; data: string; status: string; motorista: { nome: string } | null };
  paradas: Parada[];
  expira: string;
}

const concluida = (s: string) => s === "ENTREGUE" || s === "FINALIZADO";

async function iniciarRota(token: string): Promise<{ avancadas: number; puladas: number }> {
  const { posicao, gps } = await obterPosicao();
  const res = await fetch(`/api/public/rota/${token}/iniciar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ posicao, gps }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || "Não foi possível iniciar a rota");
  return data;
}

function Resumo({ info, agora }: { info: Info; agora: number }) {
  const { rota, paradas, expira } = info;
  const entregues = paradas.filter((p) => concluida(p.status)).length;
  const pct = paradas.length ? Math.round((entregues / paradas.length) * 100) : 0;
  const horas = Math.floor((new Date(expira).getTime() - agora) / (60 * 60 * 1000));
  return (
    <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Rota {rota.codigo}</div>
      <div style={{ fontSize: 14, color: "#aaa", marginTop: 4 }}>
        📅 {new Date(rota.data).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
        {rota.motorista && ` · 🚚 ${rota.motorista.nome}`}
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
          <span style={{ fontWeight: 700 }}>{entregues} de {paradas.length} entregues</span>
          <span style={{ color: "#888" }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: "#222", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#4ade80", transition: "width .3s" }} />
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#666", marginTop: 12, paddingTop: 12, borderTop: "1px solid #222" }}>
        ⏱ Link válido por mais {horas > 0 ? `${horas}h` : "menos de 1h"}
      </div>
    </div>
  );
}

function BotaoIniciar({ token, carregadas, onFeito }: { token: string; carregadas: number; onFeito: () => Promise<void> }) {
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);

  async function iniciar() {
    if (!window.confirm(`Iniciar a rota? ${carregadas} entrega(s) carregada(s) passam para "A caminho".`)) return;
    setEnviando(true);
    setMsg(null);
    try {
      const r = await iniciarRota(token);
      setMsg({ texto: `Rota iniciada: ${r.avancadas} a caminho${r.puladas ? ` (${r.puladas} já estava adiantada)` : ""}.` });
      await onFeito();
    } catch (e) {
      setMsg({ texto: e instanceof Error ? e.message : "Erro inesperado", erro: true });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {msg && (
        <div style={{ background: msg.erro ? "#7f1d1d" : "#1e293b", padding: "12px 16px", borderRadius: 8, marginBottom: 12, fontSize: 14, color: msg.erro ? "#fecaca" : "#fff", textAlign: "center" }}>
          {msg.erro ? "❌ " : "✅ "}{msg.texto}
        </div>
      )}
      {carregadas > 0 && (
        <button onClick={iniciar} disabled={enviando}
          style={{
            width: "100%", background: "#f97316", color: "#fff", padding: "20px", borderRadius: 12, border: "none",
            fontSize: 18, fontWeight: 700, cursor: "pointer", opacity: enviando ? 0.6 : 1,
          }}>
          🚚 {enviando ? "Iniciando…" : "Iniciar rota"}
        </button>
      )}
    </div>
  );
}

export default function RotaPublicPage() {
  const params = useParams();
  const token = params!.token as string;
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Instante da carga: base para "válido por mais Nh" sem chamar Date.now() no render.
  const [agora] = useState(() => Date.now());

  const fetchInfo = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/rota/${token}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErro(j.error || "Link inválido ou expirado");
      } else {
        setInfo(await r.json());
      }
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

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
          <p style={{ fontSize: 14, color: "#888" }}>Este link não é mais válido. Peça um novo link ao pessoal da Magna Log.</p>
        </div>
      </div>
    );
  }

  const carregadas = info.paradas.filter((p) => p.status === "CARREGADO").length;
  const rotaAberta = info.rota.status === "PLANEJADA" || info.rota.status === "EM_ANDAMENTO";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ background: "#f97316", padding: "16px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 700, letterSpacing: 1 }}>MAGNA LOG</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>Minha Rota</div>
      </div>

      <div style={{ maxWidth: 500, margin: "0 auto", padding: "20px 16px 60px" }}>
        <Resumo info={info} agora={agora} />

        {info.rota.status === "CONCLUIDA" ? (
          <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 12, padding: 16, marginBottom: 16, textAlign: "center", color: "#86efac", fontWeight: 700 }}>
            ✅ Rota concluída
          </div>
        ) : rotaAberta && (
          <BotaoIniciar token={token} carregadas={carregadas} onFeito={fetchInfo} />
        )}

        {info.paradas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 16px", color: "#666", fontSize: 13 }}>Nenhuma parada nesta rota.</div>
        ) : (
          info.paradas.map((p) => <ParadaCard key={p.id} parada={p} rotaToken={token} onAtualizado={fetchInfo} />)
        )}
      </div>
    </div>
  );
}
