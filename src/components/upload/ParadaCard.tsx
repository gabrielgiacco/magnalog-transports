"use client";
import { OcorrenciaMotorista } from "@/components/upload/OcorrenciaMotorista";

export interface Parada {
  ordem: number;
  id: string;
  codigo: string;
  razaoSocial: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string;
  uf: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
  volumeTotal: number;
  quantidadePaletes: number;
  status: string;
  dataEntrega: string | null;
  notas: { numero: string; emitenteRazao: string; volumes: number }[];
  temCanhoto: boolean;
  temAssinatura: boolean;
  ocorrenciaAberta: boolean;
  token: string | null;
}

// Linguagem do motorista, não da equipe.
const STATUS: Record<string, { rotulo: string; cor: string }> = {
  PROGRAMADO: { rotulo: "No depósito", cor: "#888" },
  EM_SEPARACAO: { rotulo: "No depósito", cor: "#888" },
  CARREGADO: { rotulo: "Aguardando saída", cor: "#f59e0b" },
  EM_ROTA: { rotulo: "A caminho", cor: "#f97316" },
  ENTREGUE: { rotulo: "Entregue ✅", cor: "#4ade80" },
  FINALIZADO: { rotulo: "Entregue ✅", cor: "#4ade80" },
  OCORRENCIA: { rotulo: "Com ocorrência", cor: "#f87171" },
};

const concluida = (s: string) => s === "ENTREGUE" || s === "FINALIZADO";

function corDoCard(status: string): { fundo: string; borda: string } {
  if (concluida(status)) return { fundo: "#052e16", borda: "#166534" };
  if (status === "OCORRENCIA") return { fundo: "#7f1d1d", borda: "#991b1b" };
  if (status === "EM_ROTA") return { fundo: "#111", borda: "#f97316" };
  return { fundo: "#111", borda: "#222" };
}

/** Rota no Google Maps: coordenada quando existe, senão o endereço por extenso. */
function urlMapa(p: Parada): string {
  const destino = p.latitude != null && p.longitude != null
    ? `${p.latitude},${p.longitude}`
    : [p.endereco, p.bairro, `${p.cidade}${p.uf ? ` - ${p.uf}` : ""}`, p.cep].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`;
}

const chip = (texto: string, cor: string) => (
  <span style={{ fontSize: 11, fontWeight: 700, color: cor, background: `${cor}22`, padding: "3px 8px", borderRadius: 6 }}>{texto}</span>
);

function Endereco({ p }: { p: Parada }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.45, color: "#e5e5e5", margin: "10px 0" }}>
      {p.endereco && <div style={{ fontWeight: 600 }}>📍 {p.endereco}</div>}
      {p.bairro && <div style={{ color: "#bbb" }}>{p.bairro}</div>}
      <div style={{ color: "#bbb" }}>{p.cidade}{p.uf ? ` — ${p.uf}` : ""}</div>
      {p.cep && <div style={{ color: "#888", fontFamily: "monospace", fontSize: 13 }}>CEP {p.cep}</div>}
      <a href={urlMapa(p)} target="_blank" rel="noopener noreferrer"
        style={{ display: "inline-block", marginTop: 8, color: "#f97316", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
        🗺 Abrir no mapa →
      </a>
    </div>
  );
}

function Notas({ p }: { p: Parada }) {
  return (
    <div style={{ borderTop: "1px solid #222", paddingTop: 10, marginTop: 4 }}>
      {p.notas.map((n) => (
        <div key={n.numero} style={{ fontSize: 13, marginBottom: 3 }}>
          <span style={{ fontFamily: "monospace", color: "#f97316", fontWeight: 700 }}>NF {n.numero}</span>
          <span style={{ color: "#888" }}> · {n.emitenteRazao}</span>
          {n.volumes > 0 && <span style={{ color: "#666" }}> · {n.volumes} vol</span>}
        </div>
      ))}
      <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
        📦 {p.volumeTotal} volume(s){p.quantidadePaletes > 0 ? ` · ${p.quantidadePaletes} palete(s)` : ""}
      </div>
      {p.notas.length > 0 && (
        <div style={{ fontSize: 13, color: "#fde68a", marginTop: 4, fontWeight: 600 }}>
          ✍️ {p.notas.length} canhoto(s) para assinar — cada nota tem o seu
        </div>
      )}
    </div>
  );
}

function Acoes({ p, rotaToken, onAtualizado }: { p: Parada; rotaToken: string; onAtualizado: () => Promise<void> }) {
  const feita = concluida(p.status);
  const href = `/upload/${p.token}?rota=${rotaToken}`;

  if (p.token && !feita && p.status !== "OCORRENCIA") {
    return (
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <a href={href}
          style={{
            display: "block", textAlign: "center", background: "#f97316", color: "#fff", padding: "16px", borderRadius: 12,
            fontSize: 16, fontWeight: 700, textDecoration: "none",
          }}>
          📷 Abrir entrega →
        </a>
        <OcorrenciaMotorista token={p.token} onRegistrada={onAtualizado} />
      </div>
    );
  }
  if (feita && p.token) {
    return (
      <a href={href} style={{ display: "block", textAlign: "center", marginTop: 12, color: "#86efac", fontSize: 13, textDecoration: "none" }}>
        Ver comprovantes →
      </a>
    );
  }
  if (!p.token && !feita) {
    return (
      <div style={{ background: "#422006", border: "1px solid #a16207", padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#fde68a", marginTop: 12 }}>
        Link desta parada expirado — peça um novo à Magna Log.
      </div>
    );
  }
  return null;
}

export function ParadaCard({ parada: p, rotaToken, onAtualizado }: {
  parada: Parada;
  rotaToken: string;
  onAtualizado: () => Promise<void>;
}) {
  const st = STATUS[p.status] || { rotulo: p.status, cor: "#888" };
  const { fundo, borda } = corDoCard(p.status);
  const feita = concluida(p.status);

  return (
    <div style={{ background: fundo, border: `1px solid ${borda}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%", background: feita ? "#166534" : "#f97316",
          color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          {p.ordem}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{p.razaoSocial}</div>
          <div style={{ fontSize: 11, color: "#666", fontFamily: "monospace" }}>{p.codigo}</div>
        </div>
        {chip(st.rotulo, st.cor)}
      </div>

      <Endereco p={p} />
      <Notas p={p} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {p.temCanhoto && chip("📷 Canhoto enviado", "#4ade80")}
        {p.temAssinatura && chip("✍️ Assinatura colhida", "#4ade80")}
        {p.ocorrenciaAberta && chip("⚠ Ocorrência registrada", "#fbbf24")}
      </div>

      <Acoes p={p} rotaToken={rotaToken} onAtualizado={onAtualizado} />
    </div>
  );
}
