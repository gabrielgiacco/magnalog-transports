"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlertTriangle, Clock, CheckCircle2, X, HardDrive } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Alerta {
  id: string;
  tipo: "atrasada" | "ocorrencia" | "entregue" | "storage";
  titulo: string;
  subtitulo: string;
  href: string;
  ts: number;
  lida: boolean;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Fetch alerts every 60s
  useEffect(() => {
    const load = async () => {
      try {
        const [res, resStorage] = await Promise.all([
          fetch("/api/dashboard"),
          fetch("/api/storage/status").catch(() => null),
        ]);
        if (!res.ok) return;
        const data = await res.json();
        const now = Date.now();
        const newAlerts: Alerta[] = [];

        // Alerta de storage — só se veio resposta OK e precisaAlerta
        if (resStorage?.ok) {
          const s = await resStorage.json();
          if (s?.precisaAlerta) {
            newAlerts.push({
              id: "storage_low",
              tipo: "storage",
              titulo: "Armazenamento quase cheio",
              subtitulo: `Restam ${Number(s.disponivelGB).toFixed(2)} GB de ${s.limiteGB} GB — libere espaço`,
              href: "/canhotos",
              ts: now,
              lida: false,
            });
          }
        }

        if (data.kpis?.atrasadas > 0) {
          newAlerts.push({
            id: "atrasadas",
            tipo: "atrasada",
            titulo: `${data.kpis.atrasadas} entrega(s) atrasada(s)`,
            subtitulo: "Prazo vencido e não entregue",
            href: "/entregas?atrasadas=true",
            ts: now,
            lida: false,
          });
        }
        if (data.kpis?.ocorrenciasAbertas > 0) {
          newAlerts.push({
            id: "ocorrencias",
            tipo: "ocorrencia",
            titulo: `${data.kpis.ocorrenciasAbertas} ocorrência(s) em aberto`,
            subtitulo: "Requer atenção imediata",
            href: "/entregas?status=OCORRENCIA",
            ts: now,
            lida: false,
          });
        }
        if (data.kpis?.entreguesHoje > 0) {
          newAlerts.push({
            id: "entregues_hoje",
            tipo: "entregue",
            titulo: `${data.kpis.entreguesHoje} entrega(s) hoje`,
            subtitulo: "Finalizadas com sucesso",
            href: "/entregas?status=ENTREGUE",
            ts: now,
            lida: true,
          });
        }
        setAlertas(newAlerts);
      } catch {}
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  const naoLidas = alertas.filter((a) => !a.lida).length;

  const iconMap = {
    atrasada: <Clock size={14} style={{ color: "#ef4444" }} />,
    ocorrencia: <AlertTriangle size={14} style={{ color: "#f59e0b" }} />,
    entregue: <CheckCircle2 size={14} style={{ color: "#10b981" }} />,
    storage: <HardDrive size={14} style={{ color: "#ef4444" }} />,
  };

  const bgMap = {
    atrasada: "rgba(239,68,68,.08)",
    ocorrencia: "rgba(245,158,11,.08)",
    entregue: "rgba(16,185,129,.08)",
    storage: "rgba(239,68,68,.1)",
  };

  function markRead(id: string) {
    setAlertas((prev) => prev.map((a) => (a.id === id ? { ...a, lida: true } : a)));
  }

  function markAllRead() {
    setAlertas((prev) => prev.map((a) => ({ ...a, lida: true })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg transition-all hover:opacity-80"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)" }}
      >
        <Bell size={15} />
        {naoLidas > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
            style={{ background: "#ef4444" }}
          >
            {naoLidas}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border2)" }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span className="font-head text-sm font-bold">Notificações</span>
            <div className="flex items-center gap-2">
              {naoLidas > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] font-mono transition-all hover:opacity-70"
                  style={{ color: "var(--accent)" }}
                >
                  Marcar todas lidas
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ color: "var(--text3)" }}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {alertas.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={24} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs" style={{ color: "var(--text3)" }}>
                  Nenhuma notificação
                </p>
              </div>
            ) : (
              alertas.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-all hover:opacity-80"
                  style={{
                    background: a.lida ? "transparent" : bgMap[a.tipo],
                    borderBottom: "1px solid var(--border)",
                    opacity: a.lida ? 0.6 : 1,
                  }}
                  onClick={() => {
                    markRead(a.id);
                    setOpen(false);
                    router.push(a.href);
                  }}
                >
                  <div className="mt-0.5 flex-shrink-0">{iconMap[a.tipo]}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{a.titulo}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text3)" }}>
                      {a.subtitulo}
                    </p>
                  </div>
                  {!a.lida && (
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                      style={{ background: "#f97316" }}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
