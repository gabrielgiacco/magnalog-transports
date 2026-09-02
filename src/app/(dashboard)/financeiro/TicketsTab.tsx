"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Button, Card, Empty, Loading, Table, Td, Th, Tr } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { TIPO_TICKET_LABELS, TIPOS_TICKET } from "@/lib/ticket-calc";
import { Check, Download, RefreshCw, Trash2, X } from "lucide-react";

type Periodo = "SEMANA" | "QUINZENA" | "MES" | "PERSONALIZADO";

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "SEMANA", label: "Esta semana" },
  { key: "QUINZENA", label: "Últimos 15 dias" },
  { key: "MES", label: "Este mês" },
  { key: "PERSONALIZADO", label: "Personalizado" },
];

const CORES_TIPO: Record<string, string> = {
  PALETIZACAO: "#f97316",
  DESCARGA: "#3b82f6",
  DIARIA: "#d97706",
  REENTREGA: "#8b5cf6",
  ARMAZENAGEM: "#10b981",
};

const STATUS_LABEL: Record<string, string> = {
  ENVIADA: "Enviada",
  APROVADA: "Aprovada",
  RECUSADA: "Recusada",
  CANCELADA: "Cancelada",
};

const STATUS_COR: Record<string, string> = {
  ENVIADA: "#3b82f6",
  APROVADA: "#10b981",
  RECUSADA: "#ef4444",
  CANCELADA: "#94a3b8",
};

function iso(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Segunda-feira da semana corrente (getDay: 0=domingo).
function intervaloDoPeriodo(p: Periodo): { inicio: string; fim: string } {
  const hoje = new Date();
  const fim = iso(hoje);
  if (p === "SEMANA") {
    const seg = new Date(hoje);
    seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    return { inicio: iso(seg), fim };
  }
  if (p === "QUINZENA") {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - 14);
    return { inicio: iso(d), fim };
  }
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return { inicio: iso(primeiro), fim };
}

export function TicketsTab() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const [periodo, setPeriodo] = useState<Periodo>("MES");
  const [inicio, setInicio] = useState(() => intervaloDoPeriodo("MES").inicio);
  const [fim, setFim] = useState(() => intervaloDoPeriodo("MES").fim);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  const fetchDados = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (inicio) params.set("inicio", inicio);
      // O fim vai com a hora cheia para incluir o próprio dia.
      if (fim) params.set("fim", `${fim}T23:59:59.999Z`);
      if (status) params.set("status", status);

      const res = await fetch(`/api/tickets?${params}`);
      if (!res.ok) throw new Error();
      setDados(await res.json());
    } catch {
      toast.error("Erro ao carregar tickets");
    } finally {
      setLoading(false);
    }
  }, [inicio, fim, status]);

  useEffect(() => {
    fetchDados();
  }, [fetchDados]);

  function trocarPeriodo(p: Periodo) {
    setPeriodo(p);
    if (p !== "PERSONALIZADO") {
      const r = intervaloDoPeriodo(p);
      setInicio(r.inicio);
      setFim(r.fim);
    }
  }

  async function mudarStatus(id: string, novo: string) {
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novo }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Marcado como ${STATUS_LABEL[novo].toLowerCase()}`);
      fetchDados();
    } catch {
      toast.error("Erro ao atualizar");
    }
  }

  // Só ADMIN — a rota também barra os demais papéis no servidor.
  async function excluir(id: string, numero: string) {
    if (!confirm(`Excluir a solicitação ${numero}? Os itens vinculados vão junto e não dá para desfazer.`)) return;
    try {
      const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`${numero} excluída`);
      fetchDados();
    } catch {
      toast.error("Erro ao excluir");
    }
  }

  function exportarCsv() {
    const linhas = (dados?.solicitacoes || []).map((s: any) => [
      s.numero,
      formatDate(s.dataSolicitacao),
      s.embarcadorNome,
      s.cliente,
      s.localidade,
      s.notasFiscais,
      s.itens.map((i: any) => TIPO_TICKET_LABELS[i.tipo as keyof typeof TIPO_TICKET_LABELS]).join(" + "),
      Number(s.valorTotal).toFixed(2).replace(".", ","),
      STATUS_LABEL[s.status] || s.status,
    ]);
    const cabecalho = ["Número", "Data", "Embarcador", "Cliente", "Localidade", "NFs", "Tipos", "Valor", "Status"];
    // BOM + ";" para o Excel pt-BR abrir direito, mesmo padrão de /api/export.
    const csv =
      "﻿" +
      [cabecalho, ...linhas].map((l) => l.map((c: any) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tickets-${inicio}-a-${fim}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const totalPorTipo = useMemo(() => dados?.porTipo || {}, [dados]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex gap-1.5 flex-wrap">
            {PERIODOS.map((p) => (
              <button
                key={p.key}
                onClick={() => trocarPeriodo(p.key)}
                className="text-xs font-bold px-3 py-2 rounded-lg transition-all"
                style={{
                  background: periodo === p.key ? "rgba(249,115,22,.12)" : "var(--surface2)",
                  border: `1px solid ${periodo === p.key ? "var(--accent)" : "var(--border)"}`,
                  color: periodo === p.key ? "var(--accent)" : "var(--text2)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {periodo === "PERSONALIZADO" && (
            <>
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </>
          )}

          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={fetchDados}><RefreshCw size={13} /> Atualizar</Button>
          <Button variant="ghost" size="sm" onClick={exportarCsv} disabled={!dados?.solicitacoes?.length}>
            <Download size={13} /> Exportar
          </Button>
        </div>
      </Card>

      {loading ? (
        <Loading />
      ) : (
        <>
          {/* Valores por tipo */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="p-4">
              <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text3)" }}>Total solicitado</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(dados?.valorTotal || 0)}</div>
              <div className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>{dados?.total || 0} ticket(s)</div>
            </Card>
            {TIPOS_TICKET.map((t) => (
              <Card key={t} className="p-4">
                <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: CORES_TIPO[t] }}>
                  {TIPO_TICKET_LABELS[t]}
                </div>
                <div className="text-lg font-bold mt-1">{formatCurrency(totalPorTipo[t] || 0)}</div>
              </Card>
            ))}
          </div>

          {/* Status */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <span key={k} className="text-xs font-bold px-3 py-1.5 rounded-lg"
                style={{ background: `${STATUS_COR[k]}18`, color: STATUS_COR[k], border: `1px solid ${STATUS_COR[k]}33` }}>
                {v}: {dados?.porStatus?.[k] || 0}
              </span>
            ))}
          </div>

          {/* Lista */}
          <Card className="p-0 overflow-hidden">
            {!dados?.solicitacoes?.length ? (
              <Empty icon="🧾" text="Nenhum ticket solicitado no período" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Número</Th>
                    <Th>Data</Th>
                    <Th>Embarcador</Th>
                    <Th>Cliente / NFs</Th>
                    <Th>Tipos</Th>
                    <Th>Valor</Th>
                    <Th>Status</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {dados.solicitacoes.map((s: any) => (
                    <Tr key={s.id}>
                      <Td><span className="font-mono text-xs font-bold">{s.numero}</span></Td>
                      <Td><span className="text-xs">{formatDate(s.dataSolicitacao)}</span></Td>
                      <Td><span className="text-xs">{s.embarcadorNome || "—"}</span></Td>
                      <Td>
                        <div className="text-sm font-semibold leading-tight">{s.cliente}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{s.notasFiscais}</div>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {s.itens.map((i: any) => (
                            <span key={i.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: `${CORES_TIPO[i.tipo]}1a`, color: CORES_TIPO[i.tipo] }}>
                              {TIPO_TICKET_LABELS[i.tipo as keyof typeof TIPO_TICKET_LABELS]}
                            </span>
                          ))}
                        </div>
                      </Td>
                      <Td><span className="text-sm font-bold font-mono">{formatCurrency(s.valorTotal)}</span></Td>
                      <Td>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                          style={{ background: `${STATUS_COR[s.status]}1a`, color: STATUS_COR[s.status] }}>
                          {STATUS_LABEL[s.status] || s.status}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <div className="flex gap-1.5 justify-end">
                          {s.status !== "APROVADA" && (
                            <button onClick={() => mudarStatus(s.id, "APROVADA")} title="Marcar como aprovado"
                              className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                              style={{ background: "rgba(16,185,129,.1)", color: "#10b981" }}>
                              <Check size={12} />
                            </button>
                          )}
                          {s.status !== "RECUSADA" && (
                            <button onClick={() => mudarStatus(s.id, "RECUSADA")} title="Marcar como recusado"
                              className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                              style={{ background: "rgba(239,68,68,.1)", color: "#ef4444" }}>
                              <X size={12} />
                            </button>
                          )}
                          <button onClick={() => router.push(`/entregas/${s.entregaId}`)} title="Abrir entrega"
                            className="text-[10px] font-bold px-2 py-1.5 rounded-lg hover:opacity-70 transition-all"
                            style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                            Entrega
                          </button>
                          {isAdmin && (
                            <button onClick={() => excluir(s.id, s.numero)} title="Excluir solicitação"
                              className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                              style={{ background: "rgba(239,68,68,.1)", color: "#ef4444" }}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
