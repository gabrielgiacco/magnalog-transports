"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Empty, Input } from "@/components/ui";
import { navGroups } from "@/components/layout/nav-items";
import type { StatusPresenca } from "@/lib/presenca";
import { RefreshCw, Users } from "lucide-react";

interface Visita {
  id: string;
  inicio: string;
  ultimoSinal: string;
  tela: string;
  user: { name: string | null; email: string | null; role: string };
  status?: StatusPresenca; // so no retrato de agora
  aberta?: boolean;        // so no historico
}

type Aba = "agora" | "historico";

const ITENS_MENU = navGroups.flatMap((g) => g.items);

/** "/entregas/abc" -> "Entregas". Vence o href mais longo que casa; sem item, mostra o pathname. */
function rotuloDaTela(pathname: string): string {
  const casa = ITENS_MENU.filter((i) =>
    i.href === "/dashboard" ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/")
  );
  const melhor = casa.sort((a, b) => b.href.length - a.href.length)[0];
  return melhor?.label || pathname;
}

function haQuanto(iso: string, agora: number): string {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  return `há ${Math.round(m / 60)} h`;
}

function duracao(inicioIso: string, fimIso: string): string {
  const m = Math.max(1, Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** YYYY-MM-DD no fuso do navegador (o input type="date" trabalha assim). */
function diaLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PresencaPanel() {
  const [aba, setAba] = useState<Aba>("agora");
  const [online, setOnline] = useState<Visita[] | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [dia, setDia] = useState(diaLocal());
  const [visitas, setVisitas] = useState<Visita[] | null>(null);
  const [erroAgora, setErroAgora] = useState<string | null>(null);
  const [erroDia, setErroDia] = useState<string | null>(null);
  const seqDia = useRef(0);

  const carregarOnline = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/presenca");
      if (!res.ok) {
        setErroAgora("Não foi possível carregar a presença");
        return;
      }
      setOnline((await res.json()).online);
      setAgora(Date.now());
      setErroAgora(null);
    } catch {
      setErroAgora("Não foi possível carregar a presença");
    }
  }, []);

  const carregarDia = useCallback(async () => {
    // Campo de data limpo ou incompleto emite ""; sem isso o toISOString() abaixo lanca.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
    // Limites do dia no fuso do navegador — o servidor roda em UTC e nao sabe onde o dia comeca.
    const inicio = new Date(`${dia}T00:00:00`).toISOString();
    const fim = new Date(`${dia}T23:59:59.999`).toISOString();
    // Resposta atrasada de um dia anterior nao pode sobrescrever a do dia atual.
    const meu = ++seqDia.current;
    try {
      const res = await fetch(`/api/presenca?inicio=${inicio}&fim=${fim}`);
      if (meu !== seqDia.current) return;
      if (!res.ok) {
        setErroDia("Não foi possível carregar a presença");
        return;
      }
      setVisitas((await res.json()).visitas);
      setErroDia(null);
    } catch {
      if (meu !== seqDia.current) return;
      setErroDia("Não foi possível carregar a presença");
    }
  }, [dia]);

  useEffect(() => {
    carregarOnline();
    const timer = setInterval(carregarOnline, 30_000);
    return () => clearInterval(timer);
  }, [carregarOnline]);

  useEffect(() => {
    if (aba === "historico") carregarDia();
  }, [aba, carregarDia]);

  const nOnline = online?.filter((v) => v.status === "online").length ?? 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: "var(--accent)" }} />
          <h3 className="font-head text-[14px] font-bold">Presença</h3>
          <span
            className="font-mono text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: "rgba(16,185,129,.12)", color: "#34d399", border: "1px solid rgba(16,185,129,.25)" }}
          >
            {nOnline} ONLINE
          </span>
        </div>
        <div className="flex items-center gap-1">
          <AbaBtn ativa={aba === "agora"} onClick={() => setAba("agora")}>Agora</AbaBtn>
          <AbaBtn ativa={aba === "historico"} onClick={() => setAba("historico")}>Histórico</AbaBtn>
          <Button variant="ghost" size="sm" onClick={aba === "agora" ? carregarOnline : carregarDia} title="Atualizar">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {(aba === "agora" ? erroAgora : erroDia) && (
        <p className="text-xs mb-2" style={{ color: "#f87171" }}>{aba === "agora" ? erroAgora : erroDia}</p>
      )}

      {aba === "agora" ? (
        <ListaAgora online={online} agora={agora} />
      ) : (
        <ListaHistorico dia={dia} onDia={setDia} visitas={visitas} />
      )}
    </Card>
  );
}

function AbaBtn({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
      style={
        ativa
          ? { background: "rgba(249,115,22,.12)", color: "var(--accent)", border: "1px solid rgba(249,115,22,.32)" }
          : { color: "var(--text2)", border: "1px solid transparent" }
      }
    >
      {children}
    </button>
  );
}

function Avatar({ nome }: { nome: string | null }) {
  return (
    <div
      className="w-8 h-8 min-w-[32px] rounded-full flex items-center justify-center font-head text-[12px] font-black text-white"
      style={{ background: "linear-gradient(140deg,#f97316,#c2410c)" }}
    >
      {nome?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

function ListaAgora({ online, agora }: { online: Visita[] | null; agora: number }) {
  if (!online) return <p className="text-xs" style={{ color: "var(--text3)" }}>Carregando…</p>;
  if (online.length === 0) return <Empty icon="🌙" text="Ninguém online agora" />;
  return (
    <div>
      {online.map((v) => {
        const isOnline = v.status === "online";
        return (
          <div key={v.id} className="flex items-center gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
            <Avatar nome={v.user.name} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{v.user.name || v.user.email || "—"}</span>
                <span className={`badge badge-${v.user.role}`}>{v.user.role}</span>
              </div>
              <div className="text-xs truncate" style={{ color: "var(--text2)" }}>
                {rotuloDaTela(v.tela)} <span style={{ color: "var(--text3)" }}>· {v.tela}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs whitespace-nowrap" style={{ color: "var(--text3)" }}>
              <span>{haQuanto(v.ultimoSinal, agora)}</span>
              <span
                className="w-2 h-2 rounded-full"
                title={isOnline ? "Online" : "Ausente"}
                style={{ background: isOnline ? "#34d399" : "#fbbf24", boxShadow: `0 0 8px ${isOnline ? "#34d399" : "#fbbf24"}` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListaHistorico({ dia, onDia, visitas }: { dia: string; onDia: (d: string) => void; visitas: Visita[] | null }) {
  return (
    <div className="space-y-3">
      <div className="w-44">
        <Input type="date" label="Dia" value={dia} onChange={(e) => onDia(e.target.value)} />
      </div>
      {!visitas ? (
        <p className="text-xs" style={{ color: "var(--text3)" }}>Carregando…</p>
      ) : visitas.length === 0 ? (
        <Empty icon="📅" text="Nenhuma visita nesse dia" />
      ) : (
        <div>
          {visitas.map((v) => (
            <div key={v.id} className="flex items-center gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <Avatar nome={v.user.name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold truncate">{v.user.name || v.user.email || "—"}</span>
                  <span className={`badge badge-${v.user.role}`}>{v.user.role}</span>
                </div>
                <div className="text-xs truncate" style={{ color: "var(--text2)" }}>
                  Última tela: {rotuloDaTela(v.tela)}
                </div>
              </div>
              <div className="text-right text-xs whitespace-nowrap font-mono" style={{ color: "var(--text3)" }}>
                <div>
                  {hora(v.inicio)} → {v.aberta ? <span style={{ color: "#34d399" }}>em aberto</span> : hora(v.ultimoSinal)}
                </div>
                <div>{duracao(v.inicio, v.ultimoSinal)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
