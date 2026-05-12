"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import {
  Button, Card, Loading, Empty, StatusBadge, Modal, Input, Select, Textarea,
  Table, Th, Td, Tr,
} from "@/components/ui";
import { formatCurrency, formatDate, formatCNPJ } from "@/lib/utils";
import {
  AlertTriangle, Plus, Search, RefreshCw, Eye, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Calendar, Truck,
  BarChart2, List, FileText, Package, TrendingUp, User, Filter, Upload, Square, CheckSquare, LogOut,
} from "lucide-react";

const TIPO_LABELS: Record<string, string> = {
  AVARIA: "Avaria", FALTA: "Falta", INVERSAO: "Inversão", SOBRA: "Sobra",
  DEVOLUCAO: "Devolução", SEM_PEDIDO: "Sem Pedido",
};
const FASE_LABELS: Record<string, string> = {
  CONFERENCIA: "Conferência", CARREGAMENTO: "Carregamento",
  EM_ROTA: "Em Rota", ENTREGA: "Entrega", DEVOLUCAO: "Devolução",
};
const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente", EM_ANALISE: "Em Análise", RESOLVIDA: "Resolvida", DESCARTADA: "Descartada",
};
const STATUS_DEV_LABELS: Record<string, string> = {
  PENDENTE: "Pendente", DEVOLVIDO_CLIENTE: "Devolvido ao Cliente",
  RETIRADO: "Retirado", DESCARTADO: "Descartado",
};

const TIPO_COLORS: Record<string, string> = {
  AVARIA: "#ef4444", FALTA: "#f97316", INVERSAO: "#8b5cf6", SOBRA: "#3b82f6",
  DEVOLUCAO: "#eab308", SEM_PEDIDO: "#6b7280",
};

type TabView = "dashboard" | "registros" | "devolucoes";

export default function AvariasPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabView>("dashboard");

  // Dashboard
  const [resumo, setResumo] = useState<any>(null);
  const [loadingResumo, setLoadingResumo] = useState(true);

  // Registros list
  const [avarias, setAvarias] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterFase, setFilterFase] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Devolucoes (grouped by avaria)
  const [devGroups, setDevGroups] = useState<{ avaria: any; nfds: any[] }[]>([]);
  const [loadingDev, setLoadingDev] = useState(false);
  const [expandedDevGroups, setExpandedDevGroups] = useState<string[]>([]);

  // Import NFD modal
  const [showImportNFD, setShowImportNFD] = useState(false);
  const [importingNFD, setImportingNFD] = useState(false);
  const [nfdFiles, setNfdFiles] = useState<File[]>([]);

  // Bulk devolucao actions
  const [selectedDevIds, setSelectedDevIds] = useState<string[]>([]);
  const [showBulkSaida, setShowBulkSaida] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkForm, setBulkForm] = useState({ status: "RETIRADO", motorista: "", placa: "", transportadora: "", observacoes: "" });

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    tipo: "AVARIA", fase: "CONFERENCIA", dataOcorrencia: new Date().toISOString().slice(0, 10),
    localOcorrencia: "", descricao: "", observacoes: "",
    entregaId: "", notaFiscalId: "", motoristaId: "",
  });
  const [entregaSearch, setEntregaSearch] = useState("");
  const [entregaResults, setEntregaResults] = useState<any[]>([]);
  const [selectedEntrega, setSelectedEntrega] = useState<any>(null);
  const [selectedNF, setSelectedNF] = useState<any>(null);
  const [nfProdutos, setNfProdutos] = useState<any[]>([]);
  const [produtosSelecionados, setProdutosSelecionados] = useState<any[]>([]);
  const [motoristas, setMotoristas] = useState<any[]>([]);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch dashboard
  const fetchResumo = useCallback(async () => {
    setLoadingResumo(true);
    try {
      const res = await fetch("/api/avarias/resumo");
      setResumo(await res.json());
    } catch { toast.error("Erro ao carregar resumo"); }
    finally { setLoadingResumo(false); }
  }, []);

  // Fetch list
  const fetchAvarias = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (filterTipo) params.set("tipo", filterTipo);
    if (filterFase) params.set("fase", filterFase);
    if (filterStatus) params.set("status", filterStatus);
    try {
      const res = await fetch(`/api/avarias?${params}`);
      const data = await res.json();
      setAvarias(data.avarias || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch { toast.error("Erro ao carregar avarias"); }
    finally { setLoading(false); }
  }, [page, debouncedSearch, filterTipo, filterFase, filterStatus]);

  // Fetch devolucoes grouped by avaria
  const fetchDevolucoes = useCallback(async () => {
    setLoadingDev(true);
    try {
      const res = await fetch("/api/avarias?limit=200", { cache: "no-store" });
      const data = await res.json();
      const groups: { avaria: any; nfds: any[] }[] = [];
      for (const a of (data.avarias || [])) {
        if (a._count?.devolucoes > 0) {
          const detail = await fetch(`/api/avarias/${a.id}`, { cache: "no-store" }).then(r => r.json());
          if (detail.devolucoes?.length > 0) {
            groups.push({
              avaria: { id: a.id, codigo: a.codigo, status: a.status, descricao: a.descricao, dataOcorrencia: a.dataOcorrencia, dataChegada: detail.dataChegada || null, transportadoraChegada: detail.transportadoraChegada || "", motoristaChegada: detail.motoristaChegada || "", placaChegada: detail.placaChegada || "" },
              nfds: detail.devolucoes.map((d: any) => ({ ...d, avariaCodigo: a.codigo, avariaId: a.id })),
            });
          }
        }
      }
      setDevGroups(groups);
    } catch { toast.error("Erro ao carregar devoluções"); }
    finally { setLoadingDev(false); }
  }, []);

  useEffect(() => { fetchResumo(); fetch("/api/motoristas?ativo=true").then(r => r.json()).then(setMotoristas); }, []);
  useEffect(() => { if (tab === "registros") fetchAvarias(); }, [fetchAvarias, tab]);
  useEffect(() => { if (tab === "devolucoes") fetchDevolucoes(); }, [tab]);

  // Entrega search for create form
  useEffect(() => {
    if (!entregaSearch || entregaSearch.length < 2) { setEntregaResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/entregas?cliente=${encodeURIComponent(entregaSearch)}&limit=10`);
      const data = await res.json();
      setEntregaResults(data.entregas || []);
    }, 400);
    return () => clearTimeout(t);
  }, [entregaSearch]);

  // Load NF products when NF selected
  useEffect(() => {
    if (!form.notaFiscalId) { setNfProdutos([]); return; }
    fetch(`/api/notas/${form.notaFiscalId}/produtos`)
      .then(r => r.json())
      .then(data => setNfProdutos(data.produtos || []))
      .catch(() => setNfProdutos([]));
  }, [form.notaFiscalId]);

  function selectEntrega(e: any) {
    setSelectedEntrega(e);
    setForm(f => ({ ...f, entregaId: e.id, motoristaId: e.motorista?.id || "" }));
    setEntregaSearch("");
    setEntregaResults([]);
  }

  function selectNF(nf: any) {
    setSelectedNF(nf);
    setForm(f => ({ ...f, notaFiscalId: nf.id }));
    setProdutosSelecionados([]);
  }

  function toggleProduto(idx: number) {
    setProdutosSelecionados(prev => {
      const exists = prev.find(p => p._idx === idx);
      if (exists) return prev.filter(p => p._idx !== idx);
      const prod = nfProdutos[idx];
      return [...prev, { ...prod, _idx: idx, quantidadeAvaria: prod.quantidade }];
    });
  }

  function updateProdutoQtd(idx: number, qtd: number) {
    setProdutosSelecionados(prev => prev.map(p => p._idx === idx ? { ...p, quantidadeAvaria: qtd } : p));
  }

  function toggleAllProdutos() {
    const allSelected = nfProdutos.length > 0 && nfProdutos.every((_, idx) => produtosSelecionados.some(p => p._idx === idx));
    if (allSelected) {
      setProdutosSelecionados([]);
    } else {
      setProdutosSelecionados(nfProdutos.map((p, idx) => ({ ...p, _idx: idx, quantidadeAvaria: p.quantidade })));
    }
  }

  async function handleCreate() {
    if (!form.descricao) { toast.error("Preencha a descrição"); return; }
    setCreating(true);
    try {
      const body = {
        ...form,
        entregaId: form.entregaId || null,
        notaFiscalId: form.notaFiscalId || null,
        motoristaId: form.motoristaId || null,
        produtos: produtosSelecionados.map(p => ({
          codigoProduto: p.codigoProduto,
          descricao: p.descricao,
          ncm: p.ncm,
          unidade: p.unidade,
          quantidadeNF: p.quantidade,
          quantidadeAvaria: p.quantidadeAvaria,
          valorUnitario: p.valorUnitario,
        })),
      };
      const res = await fetch("/api/avarias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Avaria registrada!");
      setShowCreate(false);
      resetForm();
      fetchAvarias();
      fetchResumo();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  }

  function resetForm() {
    setForm({ tipo: "AVARIA", fase: "CONFERENCIA", dataOcorrencia: new Date().toISOString().slice(0, 10), localOcorrencia: "", descricao: "", observacoes: "", entregaId: "", notaFiscalId: "", motoristaId: "" });
    setSelectedEntrega(null); setSelectedNF(null); setNfProdutos([]); setProdutosSelecionados([]); setStep(1);
  }

  async function handleImportNFD() {
    if (nfdFiles.length === 0) { toast.error("Selecione ao menos um arquivo XML"); return; }
    setImportingNFD(true);
    try {
      const fd = new FormData();
      nfdFiles.forEach(f => fd.append("files", f));
      const res = await fetch("/api/avarias/devolucao-avulsa", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      const msgs = [];
      if (data.importadas > 0) msgs.push(`${data.importadas} NF(s) importada(s)`);
      if (data.duplicadas > 0) msgs.push(`${data.duplicadas} duplicada(s)`);
      if (data.erros?.length > 0) msgs.push(`${data.erros.length} erro(s)`);
      toast.success(msgs.join(" · ") || "Importação concluída");
      setShowImportNFD(false);
      setNfdFiles([]);
      fetchDevolucoes();
      fetchResumo();
      fetchAvarias();
    } catch (e: any) { toast.error(e.message); }
    finally { setImportingNFD(false); }
  }

  // Flat list of all NFDs across groups (for selection/bulk actions)
  const allDevolucoes = devGroups.flatMap(g => g.nfds);

  function toggleDevId(devId: string) {
    setSelectedDevIds(prev => prev.includes(devId) ? prev.filter(x => x !== devId) : [...prev, devId]);
  }

  function toggleAllDevs() {
    const pendentes = allDevolucoes.filter(d => d.status === "PENDENTE").map(d => d.id);
    const allSelected = pendentes.length > 0 && pendentes.every(id => selectedDevIds.includes(id));
    setSelectedDevIds(allSelected ? [] : pendentes);
  }

  async function handleBulkSaida() {
    if (selectedDevIds.length === 0) { toast.error("Selecione ao menos uma NF"); return; }
    setBulkSaving(true);
    try {
      const obs = [
        bulkForm.transportadora && `Transportadora: ${bulkForm.transportadora}`,
        bulkForm.motorista && `Motorista: ${bulkForm.motorista}`,
        bulkForm.placa && `Placa: ${bulkForm.placa}`,
        bulkForm.observacoes,
      ].filter(Boolean).join(" | ");

      for (const devId of selectedDevIds) {
        const dev = allDevolucoes.find(d => d.id === devId);
        if (!dev) continue;
        const res = await fetch(`/api/avarias/${dev.avariaId}/devolucao`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ devolucaoId: devId, status: bulkForm.status, responsavel: bulkForm.motorista || bulkForm.transportadora, observacoes: obs }),
        });
        if (!res.ok) throw new Error("Erro na API ao atualizar status.");
      }
      toast.success(`${selectedDevIds.length} NF(s) atualizada(s)`);
      setShowBulkSaida(false);
      setSelectedDevIds([]);
      setBulkForm({ status: "RETIRADO", motorista: "", placa: "", transportadora: "", observacoes: "" });
      fetchDevolucoes();
    } catch { toast.error("Erro ao atualizar"); }
    finally { setBulkSaving(false); }
  }

  async function handleSaveAvariaField(avariaId: string, field: string, value: string) {
    try {
      const payload: any = {};
      if (field === "dataChegada") {
        payload.dataChegada = value || null;
      } else {
        payload[field] = value;
      }
      const res = await fetch(`/api/avarias/${avariaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setDevGroups(prev => prev.map(g =>
        g.avaria.id === avariaId ? { ...g, avaria: { ...g.avaria, [field]: value || null } } : g
      ));
    } catch (e: any) { toast.error(e.message || "Erro ao salvar"); }
  }

  const valorTotal = produtosSelecionados.reduce((s, p) => s + (p.quantidadeAvaria * p.valorUnitario), 0);

  return (
    <>
      <Topbar title="Avarias" subtitle="Controle de mercadorias com ocorrência"
        actions={<Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}><Plus size={14} /> <span className="hidden sm:inline">Nova Avaria</span><span className="sm:hidden">Nova</span></Button>} />

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl w-full sm:w-fit" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
          {([
            { key: "dashboard", label: "Dashboard", icon: BarChart2 },
            { key: "registros", label: "Registros", icon: List },
            { key: "devolucoes", label: "Devoluções", icon: FileText },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${tab === t.key ? "bg-orange-500/10 text-orange-500 shadow-sm" : "text-[var(--text2)] hover:bg-[var(--surface)]"}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {/* DASHBOARD TAB */}
        {tab === "dashboard" && (
          loadingResumo ? <Loading /> : resumo && (
            <div className="space-y-4">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
                <KpiCard label="Este Mês" value={resumo.totalMes} icon={AlertTriangle} color="#ef4444" />
                <KpiCard label="Pendentes" value={resumo.pendentes} icon={Package} color="#f97316" />
                <KpiCard label="Resolvidas" value={resumo.resolvidas} icon={TrendingUp} color="#10b981" />
                <KpiCard label="Taxa Resolução" value={`${resumo.taxaResolucao}%`} icon={BarChart2} color="#3b82f6" />
                <KpiCard label="Valor Prejuízo" value={formatCurrency(resumo.valorTotalPrejuizo)} icon={AlertTriangle} color="#ef4444" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Por Tipo */}
                <Card>
                  <h3 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">Por Tipo</h3>
                  {resumo.porTipo.length === 0 ? <p className="text-xs text-slate-400">Sem dados</p> : (
                    <div className="space-y-2">
                      {resumo.porTipo.map((t: any) => (
                        <div key={t.tipo} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: TIPO_COLORS[t.tipo] || "#999" }} />
                            <span className="text-sm font-medium">{TIPO_LABELS[t.tipo] || t.tipo}</span>
                          </div>
                          <span className="text-sm font-bold font-mono">{t.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Por Fase */}
                <Card>
                  <h3 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">Por Fase</h3>
                  {resumo.porFase.length === 0 ? <p className="text-xs text-slate-400">Sem dados</p> : (
                    <div className="space-y-2">
                      {resumo.porFase.map((f: any) => (
                        <div key={f.fase} className="flex items-center justify-between">
                          <span className="text-sm font-medium">{FASE_LABELS[f.fase] || f.fase}</span>
                          <span className="text-sm font-bold font-mono">{f.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Por Motorista */}
                <Card>
                  <h3 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">Por Motorista</h3>
                  {resumo.porMotorista.length === 0 ? <p className="text-xs text-slate-400">Sem dados</p> : (
                    <div className="space-y-2">
                      {resumo.porMotorista.map((m: any, i: number) => (
                        <div key={m.motoristaId} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center" style={{ background: i === 0 ? "rgba(239,68,68,.1)" : "var(--surface2)", color: i === 0 ? "#ef4444" : "var(--text3)" }}>{i + 1}</span>
                            <span className="text-sm font-medium">{m.nome}</span>
                          </div>
                          <span className="text-sm font-bold font-mono">{m.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )
        )}

        {/* REGISTROS TAB */}
        {tab === "registros" && (
          <>
            <Card className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 items-stretch sm:items-center">
                <div className="relative flex-1 min-w-[160px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar código, NF, cliente..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
                <div className="grid grid-cols-3 sm:flex gap-2 sm:gap-3">
                  <select value={filterTipo} onChange={e => { setFilterTipo(e.target.value); setPage(1); }}
                    className="px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm outline-none min-w-0" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                    <option value="">Tipos</option>
                    {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select value={filterFase} onChange={e => { setFilterFase(e.target.value); setPage(1); }}
                    className="px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm outline-none min-w-0" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                    <option value="">Fases</option>
                    {Object.entries(FASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                    className="px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm outline-none min-w-0" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                    <option value="">Status</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              {loading ? <Loading /> : avarias.length === 0 ? <Empty icon="⚠️" text="Nenhuma avaria registrada" /> : (
                <>
                  {/* Mobile card list */}
                  <div className="block md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
                    {avarias.map(a => (
                      <div key={a.id} onClick={() => router.push(`/avarias/${a.id}`)}
                        className="p-3 cursor-pointer hover:bg-[#1e293b] transition-colors"
                        style={{ borderBottom: "1px solid var(--border)" }}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{a.codigo}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${TIPO_COLORS[a.tipo]}15`, color: TIPO_COLORS[a.tipo], border: `1px solid ${TIPO_COLORS[a.tipo]}30` }}>
                                {TIPO_LABELS[a.tipo] || a.tipo}
                              </span>
                              <StatusBadge status={a.status} />
                            </div>
                            <div className="text-xs font-medium truncate">{a.entrega?.razaoSocial || (a.notaFiscal ? `NF ${a.notaFiscal.numero}` : "Sem vínculo")}</div>
                          </div>
                          <span className="text-xs font-mono font-bold text-red-500 flex-shrink-0">{formatCurrency(a.valorPrejuizo)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                          <span>{formatDate(a.dataOcorrencia)} · {FASE_LABELS[a.fase] || a.fase}</span>
                          <span className="truncate max-w-[50%]">{a.motorista?.nome || "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Código</Th>
                        <Th>Data</Th>
                        <Th>Tipo</Th>
                        <Th>Fase</Th>
                        <Th>NF / Entrega</Th>
                        <Th>Motorista</Th>
                        <Th>Valor</Th>
                        <Th>Status</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {avarias.map(a => (
                        <Tr key={a.id} onClick={() => router.push(`/avarias/${a.id}`)}>
                          <Td><span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{a.codigo}</span></Td>
                          <Td><span className="text-xs font-mono">{formatDate(a.dataOcorrencia)}</span></Td>
                          <Td>
                            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: `${TIPO_COLORS[a.tipo]}15`, color: TIPO_COLORS[a.tipo], border: `1px solid ${TIPO_COLORS[a.tipo]}30` }}>
                              {TIPO_LABELS[a.tipo] || a.tipo}
                            </span>
                          </Td>
                          <Td><span className="text-xs" style={{ color: "var(--text2)" }}>{FASE_LABELS[a.fase] || a.fase}</span></Td>
                          <Td>
                            <div className="text-xs">{a.notaFiscal ? `NF ${a.notaFiscal.numero}` : "—"}</div>
                            <div className="text-[10px]" style={{ color: "var(--text3)" }}>{a.entrega?.razaoSocial || ""}</div>
                          </Td>
                          <Td><span className="text-xs" style={{ color: "var(--text2)" }}>{a.motorista?.nome || "—"}</span></Td>
                          <Td><span className="text-xs font-mono font-bold text-red-500">{formatCurrency(a.valorPrejuizo)}</span></Td>
                          <Td><StatusBadge status={a.status} /></Td>
                          <Td>
                            <button className="p-1.5 rounded-lg hover:opacity-70 transition-all" style={{ background: "var(--surface2)", color: "var(--text2)" }}
                              onClick={ev => { ev.stopPropagation(); router.push(`/avarias/${a.id}`); }}>
                              <Eye size={13} />
                            </button>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                  </div>
                  {pages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                      <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>Página {page} de {pages} · {total} registros</span>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></Button>
                        <Button variant="ghost" size="sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          </>
        )}

        {/* DEVOLUÇÕES TAB */}
        {tab === "devolucoes" && (
          <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {selectedDevIds.length > 0 && (
                <Button size="sm" onClick={() => { setShowBulkSaida(true); setBulkForm({ status: "RETIRADO", motorista: "", placa: "", transportadora: "", observacoes: "" }); }}>
                  <LogOut size={14} /> <span className="hidden sm:inline">Dar Saída</span> ({selectedDevIds.length})
                </Button>
              )}
              {allDevolucoes.some(d => d.status === "PENDENTE") && (
                <button onClick={toggleAllDevs} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-[var(--surface2)]" style={{ color: "var(--text2)" }}>
                  {allDevolucoes.filter(d => d.status === "PENDENTE").every(d => selectedDevIds.includes(d.id))
                    ? <CheckSquare size={14} className="text-orange-500" />
                    : <Square size={14} className="text-slate-400" />
                  }
                  Selecionar Todas
                </button>
              )}
            </div>
            <Button size="sm" onClick={() => { setNfdFiles([]); setShowImportNFD(true); }}>
              <Upload size={14} /> <span className="hidden sm:inline">Importar NF Devolução</span><span className="sm:hidden">Importar NFD</span>
            </Button>
          </div>

          {loadingDev ? <Loading /> : devGroups.length === 0 ? <Empty icon="📦" text="Nenhuma NF de devolução importada" /> : (
            <div className="space-y-3">
              {devGroups.map(group => {
                const isExpanded = expandedDevGroups.includes(group.avaria.id);
                const totalValor = group.nfds.reduce((s: number, d: any) => s + (d.valorNota || 0), 0);
                const emitente = group.nfds[0]?.emitenteRazao || "—";
                const cnpj = group.nfds[0]?.emitenteCnpj || "";
                const pendentes = group.nfds.filter((d: any) => d.status === "PENDENTE");
                const allGroupSelected = pendentes.length > 0 && pendentes.every((d: any) => selectedDevIds.includes(d.id));

                return (
                  <Card key={group.avaria.id} className="p-0 overflow-hidden">
                    {/* Group Header */}
                    <div
                      className="flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-[#1e293b] transition-colors"
                      onClick={() => setExpandedDevGroups(prev =>
                        prev.includes(group.avaria.id)
                          ? prev.filter((id: string) => id !== group.avaria.id)
                          : [...prev, group.avaria.id]
                      )}
                    >
                      <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                        {/* Group checkbox */}
                        {pendentes.length > 0 && (
                          <button onClick={ev => {
                            ev.stopPropagation();
                            const pendenteIds = pendentes.map((p: any) => p.id);
                            if (allGroupSelected) {
                              setSelectedDevIds(prev => prev.filter(id => !pendenteIds.includes(id)));
                            } else {
                              setSelectedDevIds(prev => Array.from(new Set([...prev, ...pendenteIds])));
                            }
                          }}>
                            {allGroupSelected ? <CheckSquare size={18} className="text-orange-500" /> : <Square size={18} className="text-slate-400" />}
                          </button>
                        )}

                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(234,179,8,.08)", border: "1px solid rgba(234,179,8,.15)" }}>
                          <Package size={16} className="text-yellow-500" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>{group.avaria.codigo}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                              background: group.avaria.status === "PENDENTE" ? "rgba(249,115,22,.1)" : group.avaria.status === "RESOLVIDA" ? "rgba(16,185,129,.1)" : "rgba(107,114,128,.1)",
                              color: group.avaria.status === "PENDENTE" ? "#f97316" : group.avaria.status === "RESOLVIDA" ? "#10b981" : "#6b7280",
                            }}>
                              {STATUS_LABELS[group.avaria.status] || group.avaria.status}
                            </span>
                          </div>
                          <div className="text-xs truncate" style={{ color: "var(--text2)" }}>
                            {emitente}
                            {cnpj && <span className="ml-2 font-mono text-[10px]" style={{ color: "var(--text3)" }}>{formatCNPJ(cnpj)}</span>}
                          </div>
                        </div>

                        {/* Summary stats */}
                        <div className="hidden md:flex items-center gap-6 flex-shrink-0">
                          <div className="text-center">
                            <div className="text-[9px] font-mono uppercase text-slate-400">NFs</div>
                            <div className="text-sm font-bold font-mono" style={{ color: "var(--text)" }}>{group.nfds.length}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[9px] font-mono uppercase text-slate-400">Valor Total</div>
                            <div className="text-sm font-bold font-mono text-emerald-600">{formatCurrency(totalValor)}</div>
                          </div>
                          <div className="text-center" onClick={ev => ev.stopPropagation()}>
                            <div className="text-[9px] font-mono uppercase text-slate-400 flex items-center gap-1 justify-center"><Calendar size={10} /> Chegada</div>
                            <input
                              type="date"
                              value={group.avaria.dataChegada ? new Date(group.avaria.dataChegada).toISOString().slice(0, 10) : ""}
                              onChange={e => handleSaveAvariaField(group.avaria.id, "dataChegada", e.target.value)}
                              className="text-xs font-mono font-bold px-1.5 py-0.5 rounded cursor-pointer outline-none"
                              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: group.avaria.dataChegada ? "var(--text)" : "var(--text3)", maxWidth: "120px" }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="ml-3 flex-shrink-0">
                        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </div>
                    </div>

                    {/* Mobile stats */}
                    <div className="flex md:hidden items-center gap-4 px-4 pb-3 -mt-1">
                      <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                        {group.nfds.length} NF(s) · {formatCurrency(totalValor)}
                      </span>
                      <input
                        type="date"
                        value={group.avaria.dataChegada ? new Date(group.avaria.dataChegada).toISOString().slice(0, 10) : ""}
                        onChange={e => handleSaveAvariaField(group.avaria.id, "dataChegada", e.target.value)}
                        onClick={ev => ev.stopPropagation()}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer outline-none"
                        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: group.avaria.dataChegada ? "var(--text)" : "var(--text3)" }}
                      />
                    </div>

                    {/* Expanded - transport info + individual NFDs */}
                    {isExpanded && (
                      <div style={{ borderTop: "1px solid var(--border)" }}>
                        {/* Editable transport info */}
                        <div className="px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                          <Truck size={14} className="text-slate-400 flex-shrink-0" />
                          <span className="text-[10px] font-mono uppercase font-bold text-slate-400 flex-shrink-0">Entrega:</span>
                          <input
                            type="text"
                            placeholder="Transportadora"
                            value={group.avaria.transportadoraChegada || ""}
                            onChange={e => setDevGroups(prev => prev.map(g => g.avaria.id === group.avaria.id ? { ...g, avaria: { ...g.avaria, transportadoraChegada: e.target.value } } : g))}
                            onBlur={e => handleSaveAvariaField(group.avaria.id, "transportadoraChegada", e.target.value)}
                            className="text-xs px-2 py-1.5 rounded-lg outline-none flex-1 min-w-[120px]"
                            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                          />
                          <input
                            type="text"
                            placeholder="Motorista"
                            value={group.avaria.motoristaChegada || ""}
                            onChange={e => setDevGroups(prev => prev.map(g => g.avaria.id === group.avaria.id ? { ...g, avaria: { ...g.avaria, motoristaChegada: e.target.value } } : g))}
                            onBlur={e => handleSaveAvariaField(group.avaria.id, "motoristaChegada", e.target.value)}
                            className="text-xs px-2 py-1.5 rounded-lg outline-none flex-1 min-w-[120px]"
                            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                          />
                          <input
                            type="text"
                            placeholder="Placa"
                            value={group.avaria.placaChegada || ""}
                            onChange={e => setDevGroups(prev => prev.map(g => g.avaria.id === group.avaria.id ? { ...g, avaria: { ...g.avaria, placaChegada: e.target.value.toUpperCase() } } : g))}
                            onBlur={e => handleSaveAvariaField(group.avaria.id, "placaChegada", e.target.value)}
                            className="text-xs px-2 py-1.5 rounded-lg outline-none font-mono uppercase w-[100px]"
                            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                          />
                        </div>

                        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                          {group.nfds.map((d: any) => (
                            <div key={d.id} className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3 hover:bg-[#1e293b] transition-colors cursor-pointer"
                              onClick={() => router.push(`/avarias/${d.avariaId}`)}>
                              {/* Checkbox */}
                              <div className="flex-shrink-0">
                                {d.status === "PENDENTE" ? (
                                  <button onClick={ev => { ev.stopPropagation(); toggleDevId(d.id); }}>
                                    {selectedDevIds.includes(d.id) ? <CheckSquare size={16} className="text-orange-500" /> : <Square size={16} className="text-slate-400" />}
                                  </button>
                                ) : <div className="w-4" />}
                              </div>

                              {/* NF icon */}
                              <div className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.15)" }}>
                                <FileText size={14} className="text-blue-500" />
                              </div>

                              {/* NF info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-bold" style={{ color: "#3b82f6" }}>NF {d.numero}</span>
                                  {d.serie && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--surface2)", color: "var(--text3)" }}>S{d.serie}</span>}
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full sm:hidden" style={{
                                    background: d.status === "PENDENTE" ? "rgba(249,115,22,.1)" : d.status === "DESCARTADO" ? "rgba(107,114,128,.1)" : "rgba(16,185,129,.1)",
                                    color: d.status === "PENDENTE" ? "#f97316" : d.status === "DESCARTADO" ? "#6b7280" : "#10b981",
                                  }}>
                                    {STATUS_DEV_LABELS[d.status] || d.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 sm:hidden text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                                  <span className="text-emerald-600 font-bold">{formatCurrency(d.valorNota)}</span>
                                  <span>·</span>
                                  <span>{formatDate(d.dataEmissao || d.createdAt)}</span>
                                </div>
                                {d.chaveAcesso && (
                                  <div className="hidden sm:block text-[10px] font-mono truncate mt-0.5" style={{ color: "var(--text3)" }}>{d.chaveAcesso}</div>
                                )}
                              </div>

                              {/* Value + Date - desktop */}
                              <div className="hidden sm:block text-right flex-shrink-0">
                                <div className="text-xs font-mono font-bold text-emerald-600">{formatCurrency(d.valorNota)}</div>
                                <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatDate(d.dataEmissao || d.createdAt)}</div>
                              </div>

                              {/* Status - desktop */}
                              <div className="hidden sm:block flex-shrink-0">
                                <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{
                                  background: d.status === "PENDENTE" ? "rgba(249,115,22,.1)" : d.status === "DESCARTADO" ? "rgba(107,114,128,.1)" : "rgba(16,185,129,.1)",
                                  color: d.status === "PENDENTE" ? "#f97316" : d.status === "DESCARTADO" ? "#6b7280" : "#10b981",
                                }}>
                                  {STATUS_DEV_LABELS[d.status] || d.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
          </>
        )}
      </div>

      {/* BULK SAÍDA MODAL */}
      <Modal open={showBulkSaida} onClose={() => setShowBulkSaida(false)} title={`Dar Saída — ${selectedDevIds.length} NF(s)`} size="md">
        <div className="space-y-4">
          <div className="p-3 rounded-xl flex items-center gap-3" style={{ background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.2)" }}>
            <LogOut size={18} className="text-orange-500 flex-shrink-0" />
            <p className="text-sm" style={{ color: "var(--text2)" }}>
              Registre os dados de quem retirou a mercadoria. Todas as NFs selecionadas serão atualizadas.
            </p>
          </div>
          <Select label="Status" value={bulkForm.status} onChange={e => setBulkForm(f => ({ ...f, status: e.target.value }))}>
            <option value="RETIRADO">Retirado</option>
            <option value="DEVOLVIDO_CLIENTE">Devolvido ao Cliente</option>
            <option value="DESCARTADO">Descartado</option>
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Input label="Transportadora" value={bulkForm.transportadora} onChange={e => setBulkForm(f => ({ ...f, transportadora: e.target.value }))} placeholder="Nome da transportadora..." />
            <Input label="Motorista" value={bulkForm.motorista} onChange={e => setBulkForm(f => ({ ...f, motorista: e.target.value }))} placeholder="Nome do motorista..." />
            <Input label="Placa do Veículo" value={bulkForm.placa} onChange={e => setBulkForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))} placeholder="ABC-1234" />
          </div>
          <Textarea label="Observações" value={bulkForm.observacoes} onChange={e => setBulkForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Informações adicionais..." rows={3} />

          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-3 py-2 text-[10px] font-mono uppercase font-bold" style={{ background: "var(--surface2)", color: "var(--text3)" }}>
              NFs selecionadas
            </div>
            <div className="max-h-32 overflow-y-auto divide-y" style={{ borderColor: "var(--border)" }}>
              {allDevolucoes.filter(d => selectedDevIds.includes(d.id)).map(d => (
                <div key={d.id} className="px-3 py-2 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold" style={{ color: "#3b82f6" }}>NF {d.numero}</span>
                    <span className="ml-2" style={{ color: "var(--text3)" }}>{d.emitenteRazao}</span>
                  </div>
                  <span className="font-mono" style={{ color: "#10b981" }}>{formatCurrency(d.valorNota)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowBulkSaida(false)}>Cancelar</Button>
          <Button onClick={handleBulkSaida} loading={bulkSaving}>Confirmar ({selectedDevIds.length})</Button>
        </div>
      </Modal>

      {/* IMPORT NFD MODAL */}
      <Modal open={showImportNFD} onClose={() => { setShowImportNFD(false); setNfdFiles([]); }} title="Importar NF de Devolução" size="md">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            Selecione os arquivos XML das notas fiscais de devolução. Cada NF será registrada automaticamente como uma devolução para controle interno.
          </p>
          <div
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors hover:border-orange-500/50"
            style={{ borderColor: "var(--border)", background: "var(--surface2)" }}
            onClick={() => document.getElementById("nfd-file-input")?.click()}
          >
            <Upload size={32} className="mx-auto mb-3 text-slate-400" />
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {nfdFiles.length > 0 ? `${nfdFiles.length} arquivo(s) selecionado(s)` : "Clique para selecionar XMLs"}
            </p>
            <p className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>Aceita múltiplos arquivos .xml</p>
            <input id="nfd-file-input" type="file" multiple accept=".xml" className="hidden"
              onChange={(e) => setNfdFiles(Array.from(e.target.files || []))} />
          </div>

          {nfdFiles.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {nfdFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg text-xs" style={{ background: "var(--surface2)" }}>
                  <span className="font-mono truncate flex-1" style={{ color: "var(--text)" }}>{f.name}</span>
                  <span className="text-[10px] ml-2 flex-shrink-0" style={{ color: "var(--text3)" }}>{(f.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="ghost" onClick={() => { setShowImportNFD(false); setNfdFiles([]); }}>Cancelar</Button>
          <Button onClick={handleImportNFD} loading={importingNFD} disabled={nfdFiles.length === 0}>
            <Upload size={14} /> Importar {nfdFiles.length > 0 ? `(${nfdFiles.length})` : ""}
          </Button>
        </div>
      </Modal>

      {/* CREATE AVARIA MODAL */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetForm(); }} title={`Nova Avaria — Etapa ${step}/3`} size="xl">
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <Select label="Tipo *" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <Select label="Fase *" value={form.fase} onChange={e => setForm(f => ({ ...f, fase: e.target.value }))}>
                {Object.entries(FASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <Input label="Data da Ocorrência *" type="date" value={form.dataOcorrencia} onChange={e => setForm(f => ({ ...f, dataOcorrencia: e.target.value }))} />
              <Input label="Local da Ocorrência" value={form.localOcorrencia} onChange={e => setForm(f => ({ ...f, localOcorrencia: e.target.value }))} placeholder="Ex: Galpão 2, Doca 5..." />
            </div>

            {/* Entrega search */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Vincular Entrega</span>
              {selectedEntrega ? (
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{selectedEntrega.razaoSocial}</div>
                    <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{selectedEntrega.codigo} · {selectedEntrega.cidade}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedEntrega(null); setSelectedNF(null); setForm(f => ({ ...f, entregaId: "", notaFiscalId: "", motoristaId: "" })); setProdutosSelecionados([]); setNfProdutos([]); }}>Alterar</Button>
                </div>
              ) : (
                <div className="relative">
                  <input value={entregaSearch} onChange={e => setEntregaSearch(e.target.value)}
                    placeholder="Buscar por NF, cliente, código..."
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                  {entregaResults.length > 0 && (
                    <div className="absolute z-10 top-full mt-1 w-full rounded-lg shadow-xl max-h-48 overflow-y-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      {entregaResults.map(e => (
                        <div key={e.id} onClick={() => selectEntrega(e)} className="px-3 py-2 cursor-pointer hover:bg-[var(--surface2)] transition-colors"
                          style={{ borderBottom: "1px solid var(--border)" }}>
                          <div className="text-sm font-semibold">{e.razaoSocial}</div>
                          <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{e.codigo} · {e.cidade} · {e.motorista?.nome || "sem motorista"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Select NF */}
            {selectedEntrega && selectedEntrega.notas?.length > 0 && (
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nota Fiscal</span>
                <div className="flex flex-wrap gap-2">
                  {selectedEntrega.notas.map((nf: any) => (
                    <button key={nf.id} onClick={() => selectNF(nf)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${selectedNF?.id === nf.id ? "border-orange-500/50 bg-orange-500/10 text-orange-500" : "border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                      NF {nf.numero}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Motorista */}
            <Select label="Motorista Envolvido" value={form.motoristaId} onChange={e => setForm(f => ({ ...f, motoristaId: e.target.value }))}>
              <option value="">Selecionar...</option>
              {motoristas.map((m: any) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </Select>

            <div className="flex justify-end gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => { setShowCreate(false); resetForm(); }}>Cancelar</Button>
              <Button onClick={() => setStep(2)}>Próximo</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs" style={{ color: "var(--text3)" }}>Selecione os produtos afetados{selectedNF ? ` da NF ${selectedNF.numero}` : ""} e ajuste a quantidade. Se não houver NF vinculada, pule esta etapa.</p>
              {nfProdutos.length > 0 && (
                <Button size="sm" variant="ghost" onClick={toggleAllProdutos}>
                  {nfProdutos.every((_, idx) => produtosSelecionados.some(p => p._idx === idx))
                    ? "Desmarcar tudo"
                    : "Selecionar tudo"}
                </Button>
              )}
            </div>

            {nfProdutos.length > 0 ? (
              <div className="max-h-[40vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr style={{ background: "var(--surface2)" }}>
                      <th className="px-2 py-2 text-left w-8"></th>
                      <th className="px-2 py-2 text-left text-[9px] font-bold uppercase text-slate-400">Produto</th>
                      <th className="px-2 py-2 text-right text-[9px] font-bold uppercase text-slate-400">Qtd NF</th>
                      <th className="px-2 py-2 text-right text-[9px] font-bold uppercase text-slate-400">Qtd Avaria</th>
                      <th className="px-2 py-2 text-right text-[9px] font-bold uppercase text-slate-400">Valor Un.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nfProdutos.map((p, idx) => {
                      const sel = produtosSelecionados.find(s => s._idx === idx);
                      return (
                        <tr key={idx} className={`cursor-pointer transition-colors ${sel ? "bg-orange-50" : "hover:bg-slate-50/50"}`}
                          style={{ borderTop: idx > 0 ? "1px solid var(--border)" : "none" }}
                          onClick={() => toggleProduto(idx)}>
                          <td className="px-2 py-2">
                            <input type="checkbox" checked={!!sel} readOnly className="accent-orange-500 w-4 h-4 pointer-events-none" />
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-medium">{p.descricao}</div>
                            <div className="text-[9px] font-mono text-slate-400">Cód: {p.codigoProduto} · NCM: {p.ncm}</div>
                          </td>
                          <td className="px-2 py-2 text-right font-mono">{p.quantidade}</td>
                          <td className="px-2 py-2 text-right">
                            {sel ? (
                              <input type="number" min={0} max={p.quantidade} step="any"
                                value={sel.quantidadeAvaria} onClick={e => e.stopPropagation()}
                                onChange={e => updateProdutoQtd(idx, parseFloat(e.target.value) || 0)}
                                className="w-20 px-2 py-1 rounded text-right font-mono text-xs outline-none"
                                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                            ) : <span className="font-mono text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-slate-500">{formatCurrency(p.valorUnitario)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8" style={{ color: "var(--text3)" }}>
                <Package size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">{form.notaFiscalId ? "Sem produtos no XML da NF" : "Nenhuma NF selecionada — você pode pular esta etapa"}</p>
              </div>
            )}

            {produtosSelecionados.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.15)" }}>
                <span className="text-xs font-medium text-red-500">{produtosSelecionados.length} produto(s) selecionado(s)</span>
                <span className="text-sm font-bold font-mono text-red-600">{formatCurrency(valorTotal)}</span>
              </div>
            )}

            <div className="flex justify-between gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={() => setStep(3)}>Próximo</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Textarea label="Descrição da Ocorrência *" rows={4} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Descreva o que aconteceu, quando, como foi identificado..." />
            <Textarea label="Observações" rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              placeholder="Informações adicionais..." />

            {/* Summary */}
            <div className="p-4 rounded-lg space-y-2" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Resumo</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-400">Tipo:</span> <strong>{TIPO_LABELS[form.tipo]}</strong></div>
                <div><span className="text-slate-400">Fase:</span> <strong>{FASE_LABELS[form.fase]}</strong></div>
                <div><span className="text-slate-400">Data:</span> <strong>{form.dataOcorrencia}</strong></div>
                {form.localOcorrencia && <div><span className="text-slate-400">Local:</span> <strong>{form.localOcorrencia}</strong></div>}
                {selectedEntrega && <div><span className="text-slate-400">Entrega:</span> <strong>{selectedEntrega.razaoSocial}</strong></div>}
                {selectedNF && <div><span className="text-slate-400">NF:</span> <strong>{selectedNF.numero}</strong></div>}
                {form.motoristaId && <div><span className="text-slate-400">Motorista:</span> <strong>{motoristas.find((m: any) => m.id === form.motoristaId)?.nome || "—"}</strong></div>}
                <div><span className="text-slate-400">Produtos:</span> <strong>{produtosSelecionados.length}</strong></div>
                <div><span className="text-slate-400">Valor Prejuízo:</span> <strong className="text-red-500">{formatCurrency(valorTotal)}</strong></div>
              </div>
            </div>

            <div className="flex justify-between gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => setStep(2)}>Voltar</Button>
              <Button onClick={handleCreate} loading={creating}>Registrar Avaria</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest text-slate-400 truncate">{label}</div>
          <div className="text-sm sm:text-lg font-bold font-mono truncate" style={{ color }}>{value}</div>
        </div>
      </div>
    </Card>
  );
}
