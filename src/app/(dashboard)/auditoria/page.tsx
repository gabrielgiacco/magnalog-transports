"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Input, Select, Loading, Empty, Modal, Table, Th, Td, Tr } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Shield, Search, Trash2, RefreshCw, ChevronDown, ChevronRight, Eye, EyeOff, AlertTriangle, LogIn, LogOut, ShoppingBag, MapPin, FileEdit } from "lucide-react";

interface AuditLog {
  id: string;
  timestamp: string;
  tipo: string;
  sucesso: boolean;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
  recursoTipo: string | null;
  recursoId: string | null;
  recursoDesc: string | null;
  ip: string | null;
  userAgent: string | null;
  metodo: string | null;
  rota: string | null;
  detalhes: string | null;
}

interface Resp {
  logs: AuditLog[];
  total: number;
  pages: number;
  page: number;
  kpis: {
    totalLogins: number;
    totalLoginsFail: number;
    totalRastreios: number;
    totalPortais: number;
    eventosUltimos7d: number;
  };
}

const TIPOS_EVENTO = [
  { value: "", label: "Todos" },
  { group: "Acesso", items: [
    { value: "LOGIN", label: "Login OK" },
    { value: "LOGOUT", label: "Logout" },
    { value: "LOGIN_FAIL", label: "Login falhou" },
  ] },
  { group: "Portal Cliente", items: [
    { value: "PORTAL_ACESSO", label: "Portal acessado" },
    { value: "PORTAL_BUSCA", label: "Portal busca" },
    { value: "PORTAL_VIEW_ENTREGA", label: "Portal viu entrega" },
  ] },
  { group: "Rastreio Público", items: [
    { value: "RASTREIO_PUBLICO", label: "Rastreio público" },
  ] },
  { group: "Entregas", items: [
    { value: "ENTREGA_CRIADA", label: "Entrega criada" },
    { value: "ENTREGA_EDITADA", label: "Entrega editada" },
    { value: "ENTREGA_APAGADA", label: "Entrega apagada" },
  ] },
  { group: "Ocorrências", items: [
    { value: "OCORRENCIA_CRIADA", label: "Ocorrência criada" },
    { value: "OCORRENCIA_RESOLVIDA", label: "Ocorrência resolvida" },
  ] },
  { group: "Anexos", items: [
    { value: "ANEXO_LIBERADO_PORTAL", label: "Anexo liberado ao portal" },
    { value: "ANEXO_OCULTADO_PORTAL", label: "Anexo oculto do portal" },
  ] },
  { group: "Financeiro", items: [
    { value: "FATURA_CRIADA", label: "Fatura criada" },
    { value: "FATURA_EDITADA", label: "Fatura editada" },
    { value: "CONTA_PAGAR_CRIADA", label: "Conta a pagar criada" },
    { value: "CONTA_PAGAR_PAGA", label: "Conta paga" },
    { value: "CONTA_PAGAR_APAGADA", label: "Conta apagada" },
    { value: "LANCAMENTO_CRIADO", label: "Lançamento criado" },
    { value: "LANCAMENTO_EDITADO", label: "Lançamento editado" },
    { value: "LANCAMENTO_APAGADO", label: "Lançamento apagado" },
  ] },
];

const TIPO_LABEL: Record<string, { label: string; icon: any; color: string }> = {
  LOGIN: { label: "Login", icon: LogIn, color: "#059669" },
  LOGOUT: { label: "Logout", icon: LogOut, color: "#6b7280" },
  LOGIN_FAIL: { label: "Login falhou", icon: AlertTriangle, color: "#dc2626" },
  PORTAL_ACESSO: { label: "Portal acessado", icon: ShoppingBag, color: "#2563eb" },
  PORTAL_BUSCA: { label: "Portal busca", icon: Search, color: "#2563eb" },
  PORTAL_VIEW_ENTREGA: { label: "Portal viu entrega", icon: Eye, color: "#2563eb" },
  RASTREIO_PUBLICO: { label: "Rastreio público", icon: MapPin, color: "#0891b2" },
  ENTREGA_CRIADA: { label: "Entrega criada", icon: FileEdit, color: "#059669" },
  ENTREGA_EDITADA: { label: "Entrega editada", icon: FileEdit, color: "#ea580c" },
  ENTREGA_APAGADA: { label: "Entrega apagada", icon: FileEdit, color: "#dc2626" },
  OCORRENCIA_CRIADA: { label: "Ocorrência criada", icon: AlertTriangle, color: "#d97706" },
  OCORRENCIA_RESOLVIDA: { label: "Ocorrência resolvida", icon: AlertTriangle, color: "#059669" },
  ANEXO_LIBERADO_PORTAL: { label: "Anexo liberado ao portal", icon: Eye, color: "#d97706" },
  ANEXO_OCULTADO_PORTAL: { label: "Anexo oculto do portal", icon: EyeOff, color: "#6b7280" },
  FATURA_CRIADA: { label: "Fatura criada", icon: FileEdit, color: "#059669" },
  FATURA_EDITADA: { label: "Fatura editada", icon: FileEdit, color: "#ea580c" },
  FATURA_APAGADA: { label: "Fatura apagada", icon: FileEdit, color: "#dc2626" },
  LANCAMENTO_CRIADO: { label: "Lançamento criado", icon: FileEdit, color: "#059669" },
  LANCAMENTO_EDITADO: { label: "Lançamento editado", icon: FileEdit, color: "#ea580c" },
  LANCAMENTO_APAGADO: { label: "Lançamento apagado", icon: FileEdit, color: "#dc2626" },
  CONTA_PAGAR_CRIADA: { label: "Conta a pagar criada", icon: FileEdit, color: "#059669" },
  CONTA_PAGAR_PAGA: { label: "Conta paga", icon: FileEdit, color: "#059669" },
  CONTA_PAGAR_APAGADA: { label: "Conta apagada", icon: FileEdit, color: "#dc2626" },
  OUTRO: { label: "Outro", icon: FileEdit, color: "#6b7280" },
};

function tipoMeta(tipo: string) {
  return TIPO_LABEL[tipo] || TIPO_LABEL.OUTRO;
}

function shortAgent(ua: string | null): string {
  if (!ua) return "—";
  if (/iPhone|Android/.test(ua)) return "Mobile";
  const m = ua.match(/(Chrome|Firefox|Safari|Edge)\/(\d+)/);
  if (m) return `${m[1]} ${m[2]}`;
  return ua.slice(0, 30);
}

export default function AuditoriaPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroIp, setFiltroIp] = useState("");
  const [filtroInicio, setFiltroInicio] = useState("");
  const [filtroFim, setFiltroFim] = useState("");
  const [page, setPage] = useState(1);
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroBusca) params.set("q", filtroBusca);
    if (filtroIp) params.set("ip", filtroIp);
    if (filtroInicio) params.set("inicio", filtroInicio);
    if (filtroFim) params.set("fim", filtroFim);
    params.set("page", String(page));
    params.set("limit", "50");
    const res = await fetch(`/api/auditoria?${params.toString()}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [filtroTipo, filtroBusca, filtroIp, filtroInicio, filtroFim, page]);

  useEffect(() => { load(); }, [load]);

  async function handleCleanup() {
    if (!confirm("Apagar TODOS os logs com mais de 90 dias? Esta ação é irreversível.")) return;
    setCleaning(true);
    try {
      const res = await fetch("/api/auditoria?dias=90", { method: "DELETE" });
      if (res.ok) {
        const r = await res.json();
        toast.success(`${r.apagados} logs apagados`);
        load();
      } else toast.error("Erro ao limpar logs");
    } finally { setCleaning(false); }
  }

  return (
    <>
      <Topbar title="Auditoria" subtitle="Registro de acessos e ações do sistema" />
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
        {/* KPIs */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard label="Eventos últimos 7d" value={data.kpis.eventosUltimos7d} color="#2563eb" />
            <KpiCard label="Logins" value={data.kpis.totalLogins} color="#059669" icon={LogIn} />
            <KpiCard label="Falhas de login" value={data.kpis.totalLoginsFail} color="#dc2626" icon={AlertTriangle} />
            <KpiCard label="Portal cliente" value={data.kpis.totalPortais} color="#2563eb" icon={ShoppingBag} />
            <KpiCard label="Rastreio público" value={data.kpis.totalRastreios} color="#0891b2" icon={MapPin} />
          </div>
        )}

        {/* Filtros */}
        <Card>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Tipo</label>
              <Select value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setPage(1); }}>
                <option value="">Todos os eventos</option>
                {TIPOS_EVENTO.filter((t) => !("value" in t)).map((g: any) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map((i: any) => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </optgroup>
                ))}
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Buscar</label>
              <Input placeholder="Email, nome, recurso ou texto" value={filtroBusca} onChange={(e) => { setFiltroBusca(e.target.value); setPage(1); }} />
            </div>
            <div className="w-32">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>IP</label>
              <Input placeholder="IP" value={filtroIp} onChange={(e) => { setFiltroIp(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>De</label>
              <Input type="date" value={filtroInicio} onChange={(e) => { setFiltroInicio(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Até</label>
              <Input type="date" value={filtroFim} onChange={(e) => { setFiltroFim(e.target.value); setPage(1); }} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setFiltroTipo(""); setFiltroBusca(""); setFiltroIp(""); setFiltroInicio(""); setFiltroFim(""); setPage(1); }}>
              Limpar
            </Button>
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw size={14} /> Atualizar
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCleanup} loading={cleaning}>
              <Trash2 size={14} /> Limpar &gt; 90d
            </Button>
          </div>
        </Card>

        {/* Tabela */}
        {loading ? <Loading /> : !data || data.logs.length === 0 ? (
          <Empty icon="🛡️" text="Nenhum evento encontrado com esses filtros" />
        ) : (
          <>
            <Card className="p-0 overflow-hidden">
              <Table>
                <thead>
                  <Tr>
                    <Th>Data/Hora</Th>
                    <Th>Evento</Th>
                    <Th>Usuário</Th>
                    <Th>Recurso</Th>
                    <Th>IP</Th>
                    <Th>Dispositivo</Th>
                    <Th></Th>
                  </Tr>
                </thead>
                <tbody>
                  {data.logs.map((log) => {
                    const meta = tipoMeta(log.tipo);
                    const Icon = meta.icon;
                    return (
                      <Tr key={log.id}>
                        <Td className="text-xs font-mono whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString("pt-BR")}
                        </Td>
                        <Td>
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded" style={{ background: meta.color + "15", color: meta.color }}>
                            <Icon size={11} />
                            {meta.label}
                          </span>
                          {!log.sucesso && (
                            <span className="ml-1 text-[10px] font-bold text-red-600">FALHOU</span>
                          )}
                        </Td>
                        <Td className="text-xs">
                          {log.userName || log.userEmail || <span style={{ color: "var(--text3)" }}>anônimo</span>}
                          {log.userRole && <div className="text-[10px]" style={{ color: "var(--text3)" }}>{log.userRole}</div>}
                        </Td>
                        <Td className="text-xs">
                          {log.recursoDesc ? (
                            <span title={log.recursoTipo || ""}>{log.recursoDesc}</span>
                          ) : (
                            <span style={{ color: "var(--text3)" }}>—</span>
                          )}
                        </Td>
                        <Td className="text-xs font-mono">{log.ip || "—"}</Td>
                        <Td className="text-xs" title={log.userAgent || ""}>{shortAgent(log.userAgent)}</Td>
                        <Td>
                          <button className="p-1.5 rounded hover:bg-gray-100" onClick={() => setDetailLog(log)} title="Ver detalhes">
                            <Eye size={13} />
                          </button>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>

            {/* Paginação */}
            <div className="flex justify-between items-center text-sm">
              <span style={{ color: "var(--text2)" }}>
                Página {data.page} de {data.pages} · {data.total} eventos
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Anterior
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pages}>
                  Próxima
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {detailLog && <DetalheLogModal log={detailLog} onClose={() => setDetailLog(null)} />}
    </>
  );
}

function KpiCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon?: any }) {
  return (
    <Card className="flex items-center gap-3">
      {Icon && (
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: color + "15" }}>
          <Icon size={16} style={{ color }} />
        </div>
      )}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>{label}</div>
        <div className="text-lg font-head font-bold font-mono" style={{ color }}>{value.toLocaleString("pt-BR")}</div>
      </div>
    </Card>
  );
}

function DetalheLogModal({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  const meta = tipoMeta(log.tipo);
  let detalhesParsed: any = null;
  try {
    if (log.detalhes) detalhesParsed = JSON.parse(log.detalhes);
  } catch { detalhesParsed = log.detalhes; }

  return (
    <Modal open onClose={onClose} title="Detalhes do evento" size="md">
      <div className="space-y-3 text-sm">
        <Row label="Tipo" value={<span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded" style={{ background: meta.color + "15", color: meta.color }}><meta.icon size={11} />{meta.label}</span>} />
        <Row label="Data/Hora" value={new Date(log.timestamp).toLocaleString("pt-BR")} />
        <Row label="Sucesso" value={log.sucesso ? "Sim" : "NÃO (falhou)"} />
        <Row label="Usuário" value={log.userName || log.userEmail || "anônimo"} />
        <Row label="Email" value={log.userEmail || "—"} />
        <Row label="Role" value={log.userRole || "—"} />
        <Row label="Recurso" value={log.recursoDesc || "—"} />
        <Row label="Tipo de Recurso" value={log.recursoTipo || "—"} />
        <Row label="ID do Recurso" value={log.recursoId || "—"} />
        <Row label="IP" value={log.ip || "—"} />
        <Row label="Dispositivo" value={log.userAgent || "—"} mono />
        <Row label="Método/Rota" value={`${log.metodo || "—"} ${log.rota || ""}`} mono />
        {detalhesParsed && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text2)" }}>Detalhes</div>
            <pre className="text-[11px] p-3 rounded-lg overflow-auto max-h-60" style={{ background: "var(--surface2)" }}>
              {typeof detalhesParsed === "string" ? detalhesParsed : JSON.stringify(detalhesParsed, null, 2)}
            </pre>
          </div>
        )}
        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>{label}</span>
      <span className={`text-sm ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</span>
    </div>
  );
}
