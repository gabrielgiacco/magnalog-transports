"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Topbar,
} from "@/components/layout/Topbar";
import {
  Button, Card, Loading, Empty, StatusBadge,
  Table, Th, Td, Tr, Modal, Input, Select, Textarea, ComboboxMotorista
} from "@/components/ui";
import { formatCurrency, formatDate, formatWeight, formatCNPJ } from "@/lib/utils";
import { QUALIDADE_ENABLED } from "@/lib/features";
import {
  Plus, Filter, RefreshCw, Search, Eye, ChevronLeft, ChevronRight,
  Package, MapPin, User, Truck, Trash2, ArrowUp, ArrowDown, ArrowUpDown, X, Calendar,
} from "lucide-react";
import { SugestaoVeiculoModal } from "@/components/entrega/SugestaoVeiculoModal";

/* ── Dynamic Filter Types ────────────────────────────────────────── */
interface DynamicFilter {
  id: string;
  field: string;
  value: string;
}

const FILTER_OPTIONS = [
  { value: "cidade", label: "Cidade", placeholder: "Ex: São Paulo", type: "text" },
  { value: "clienteNome", label: "Cliente", placeholder: "Razão social ou CNPJ", type: "text" },
  { value: "fornecedor", label: "Fornecedor", placeholder: "Buscar por remetente", type: "text" },
  { value: "endereco", label: "Endereço", placeholder: "Rua, Av, etc.", type: "text" },
  { value: "nf", label: "NF (Nota Fiscal)", placeholder: "Número da NF", type: "text" },
  { value: "anotacoesNf", label: "Dados Adicionais da NF", placeholder: "Buscar nos dados adicionais", type: "text" },
  { value: "codigoProduto", label: "Código do Produto", placeholder: "Ex: 8900005", type: "text" },
  { value: "uf", label: "UF", placeholder: "Ex: SP", type: "text" },
  { value: "motorista", label: "Motorista", placeholder: "Nome do motorista", type: "text" },
  { value: "volume", label: "Volume Específico", placeholder: "Ex: 5", type: "number" },
  { value: "status", label: "Status", placeholder: "Selecione o status", type: "select" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "PROGRAMADO", label: "Programado" },
  { value: "EM_SEPARACAO", label: "Em Separação" },
  { value: "CARREGADO", label: "Carregado" },
  { value: "EM_ROTA", label: "Em Rota" },
  { value: "ENTREGUE", label: "Entregue" },
  { value: "OCORRENCIA", label: "Ocorrência" },
  { value: "FINALIZADO", label: "Finalizado" },
];

const BLANK_FORM = {
  cnpj: "", razaoSocial: "", cidade: "", uf: "", endereco: "", bairro: "", cep: "",
  dataChegada: "", dataAgendada: "", motoristaId: "", veiculoId: "",
  valorFrete: "", valorDescarga: "", valorArmazenagem: "", adiantamento: "",
  observacoes: "", status: "PROGRAMADO",
  // Motorista Principal:
  valorMotorista: "",
  valorSaida: "",
  adiantamentoMotorista: "",
  descontosMotorista: "",
  dataAdiantamento: "",
  dataPagamentoSaldo: "",
  statusCanhoto: "PENDENTE",
  // Complementar:
  motoristaComplId: "",
  veiculoComplId: "",
  valorMotoristaCompl: "",
  valorSaidaCompl: "",
  adiantamentoMotoristaCompl: "",
  descontosMotoristaCompl: "",
  dataAdiantamentoCompl: "",
  dataPagamentoSaldoCompl: "",
  statusCanhotoCompl: "PENDENTE",
};

function SortTh({ col, label, sortBy, sortOrder, onSort }: {
  col: string; label: string; sortBy: string | null; sortOrder: "asc" | "desc" | null; onSort: (c: string) => void;
}) {
  const active = sortBy === col;
  return (
    <th onClick={() => onSort(col)}
      className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none group transition-colors hover:bg-gray-50"
      style={{ color: active ? "#f97316" : "var(--text3)", whiteSpace: "nowrap" }}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active && sortOrder === "asc" && <ArrowUp size={11} className="text-orange-500" />}
        {active && sortOrder === "desc" && <ArrowDown size={11} className="text-orange-500" />}
        {!active && <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-40 transition-opacity" />}
      </span>
    </th>
  );
}

export default function EntregasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const isReadOnly = userRole === "CONFERENTE";
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    try { const s = sessionStorage.getItem("entregas_filters"); return s ? JSON.parse(s).page || 1 : 1; } catch { return 1; }
  });
  const [pages, setPages] = useState(1);

  // Build initial filters from URL query params (e.g. /entregas?status=OCORRENCIA)
  function getFiltersFromURL(): DynamicFilter[] | null {
    const urlFilters: DynamicFilter[] = [];
    const supportedParams = ["status", "cidade", "clienteNome", "fornecedor", "endereco", "uf", "motorista", "volume", "nf", "anotacoesNf"];
    for (const param of supportedParams) {
      const values = searchParams.getAll(param);
      for (const val of values) {
        if (val.trim()) {
          urlFilters.push({ id: crypto.randomUUID(), field: param, value: val.trim() });
        }
      }
    }
    return urlFilters.length > 0 ? urlFilters : null;
  }

  // Restore filters from sessionStorage on mount
  function getSaved() {
    try {
      const raw = sessionStorage.getItem("entregas_filters");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // URL params take priority over saved session state
  const urlFilters = getFiltersFromURL();
  const [initialized] = useState(() => urlFilters ? null : getSaved());

  // Filters
  const [search, setSearch] = useState(initialized?.search ?? "");
  const [mostrarFinalizados, setMostrarFinalizados] = useState(initialized?.mostrarFinalizados ?? false);
  const [debouncedSearch, setDebouncedSearch] = useState(initialized?.search ?? "");

  const [showFiltros, setShowFiltros] = useState(urlFilters ? true : (initialized?.showFiltros ?? false));
  const [dynamicFilters, setDynamicFilters] = useState<DynamicFilter[]>(urlFilters ?? initialized?.dynamicFilters ?? []);
  const [atrasadas, setAtrasadas] = useState(searchParams.get("atrasadas") === "true");
  const [agendadaDe, setAgendadaDe] = useState<string>(initialized?.agendadaDe ?? "");
  const [agendadaAte, setAgendadaAte] = useState<string>(initialized?.agendadaAte ?? "");

  // Re-sync from URL when searchParams change (e.g. notification click while already on page)
  useEffect(() => {
    const urlAtrasadas = searchParams.get("atrasadas") === "true";
    setAtrasadas(urlAtrasadas);
    if (urlAtrasadas) {
      setDynamicFilters([]);
      setAgendadaDe("");
      setAgendadaAte("");
      setShowFiltros(false);
      setPage(1);
      return;
    }
    const newFilters = getFiltersFromURL();
    if (newFilters) {
      setDynamicFilters(newFilters);
      setShowFiltros(true);
      setPage(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Tri-state sort: null → "asc" → "desc" → null
  const [sortBy, setSortBy] = useState<string | null>(initialized?.sortBy ?? null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>(initialized?.sortOrder ?? null);

  // Dynamic filter helpers
  function addFilter() {
    setDynamicFilters((prev) => [
      ...prev,
      { id: crypto.randomUUID(), field: "cidade", value: "" },
    ]);
    setShowFiltros(true);
  }
  function removeFilter(id: string) {
    setDynamicFilters((prev) => prev.filter((f) => f.id !== id));
    setPage(1);
  }
  function updateFilter(id: string, updates: Partial<DynamicFilter>) {
    setDynamicFilters((prev) => prev.map((f) => f.id === id ? { ...f, ...updates } : f));
    setPage(1);
  }
  function clearAllFilters() {
    setDynamicFilters([]);
    setAgendadaDe("");
    setAgendadaAte("");
    setPage(1);
  }

  // Persist filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("entregas_filters", JSON.stringify({
      search, mostrarFinalizados, showFiltros,
      dynamicFilters,
      agendadaDe, agendadaAte,
      sortBy, sortOrder, page,
    }));
  }, [search, mostrarFinalizados, showFiltros,
      dynamicFilters,
      agendadaDe, agendadaAte,
      sortBy, sortOrder, page]);

  function toggleSort(col: string) {
    if (sortBy !== col) { setSortBy(col); setSortOrder("asc"); }
    else if (sortOrder === "asc") { setSortOrder("desc"); }
    else { setSortBy(null); setSortOrder(null); }
    setPage(1);
  }

  // Modal nova entrega
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [showComplFields, setShowComplFields] = useState(false);
  const [motoristas, setMotoristas] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);

  // Sugestão de veículo
  const [sugestaoEntregaId, setSugestaoEntregaId] = useState<string | null>(null);

  // Debounce search
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchEntregas = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "50",
      mostrarFinalizados: String(mostrarFinalizados),
    });
    if (atrasadas) params.set("atrasadas", "true");
    if (debouncedSearch) params.set("cliente", debouncedSearch);
    // Apply dynamic filters — each filter appends its field/value to the query
    for (const f of dynamicFilters) {
      if (f.value.trim()) {
        params.append(f.field, f.value.trim());
      }
    }
    // Date agendada range filter
    if (agendadaDe || agendadaAte) {
      params.set("apenasAgendadas", "true");
      if (agendadaDe) params.set("dataInicio", agendadaDe);
      if (agendadaAte) params.set("dataFim", agendadaAte);
    }
    if (sortBy && sortOrder) { params.set("sortBy", sortBy); params.set("sortOrder", sortOrder); }

    const res = await fetch(`/api/entregas?${params}`, { cache: "no-store" });
    const data = await res.json();
    setEntregas(data.entregas || []);
    setTotal(data.total || 0);
    setPages(data.pages || 1);
    setLoading(false);
  }, [page, debouncedSearch, mostrarFinalizados, dynamicFilters, sortBy, sortOrder, atrasadas, agendadaDe, agendadaAte]);

  useEffect(() => { fetchEntregas(); }, [fetchEntregas]);

  useEffect(() => {
    fetch("/api/motoristas?ativo=true").then((r) => r.json()).then(setMotoristas);
    fetch("/api/veiculos").then((r) => r.json()).then(setVeiculos);
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.cnpj || !form.razaoSocial || !form.cidade) {
      toast.error("Preencha CNPJ, Razão Social e Cidade");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/entregas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cnpj: form.cnpj.replace(/\D/g, ""),
          valorFrete: parseFloat(form.valorFrete) || 0,
          valorDescarga: parseFloat(form.valorDescarga) || 0,
          valorArmazenagem: parseFloat(form.valorArmazenagem) || 0,
          adiantamento: parseFloat(form.adiantamento) || 0,
          // Motorista Principal:
          valorMotorista: parseFloat(form.valorMotorista) || 0,
          valorSaida: parseFloat(form.valorSaida) || 0,
          adiantamentoMotorista: parseFloat(form.adiantamentoMotorista) || 0,
          descontosMotorista: parseFloat(form.descontosMotorista) || 0,
          dataAdiantamento: form.dataAdiantamento || null,
          dataPagamentoSaldo: form.dataPagamentoSaldo || null,
          statusCanhoto: form.statusCanhoto || "PENDENTE",
          // Complementar:
          motoristaComplId: form.motoristaComplId || null,
          veiculoComplId: form.veiculoComplId || null,
          valorMotoristaCompl: parseFloat(form.valorMotoristaCompl) || 0,
          valorSaidaCompl: parseFloat(form.valorSaidaCompl) || 0,
          adiantamentoMotoristaCompl: parseFloat(form.adiantamentoMotoristaCompl) || 0,
          descontosMotoristaCompl: parseFloat(form.descontosMotoristaCompl) || 0,
          dataAdiantamentoCompl: form.dataAdiantamentoCompl || null,
          dataPagamentoSaldoCompl: form.dataPagamentoSaldoCompl || null,
          statusCanhotoCompl: form.statusCanhotoCompl || "PENDENTE",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Entrega criada!");
      setShowModal(false);
      setForm({ ...BLANK_FORM });
      setShowComplFields(false);
      fetchEntregas();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function editarDescarga(id: string, atual: number) {
    const raw = window.prompt("Valor da descarga (reembolso):", String(atual || 0));
    if (raw === null) return;
    const novo = parseFloat(raw.replace(",", "."));
    if (isNaN(novo) || novo < 0) { toast.error("Valor inválido"); return; }
    try {
      const res = await fetch(`/api/entregas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valorDescarga: novo }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Descarga atualizada");
      fetchEntregas();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    }
  }

  async function deleteEntrega(id: string) {
    if (!window.confirm("Tem certeza que deseja excluir esta entrega? Esta ação não pode ser desfeita e apenas Admins têm permissão.")) return;
    try {
      const res = await fetch(`/api/entregas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Entrega excluída!");
      fetchEntregas();
    } catch (e: any) {
      let msg = e.message;
      try {
        const parsed = JSON.parse(e.message);
        if (parsed.error) msg = parsed.error;
      } catch {}
      toast.error(msg || "Erro ao excluir entrega. Verifique se você é Administrador.");
    }
  }

  const hojeStr = new Date().toISOString().split("T")[0];
  const atrasadasCount = entregas.filter((e) => {
    if (!e.dataAgendada || ["ENTREGUE", "FINALIZADO"].includes(e.status)) return false;
    const dataStr = new Date(e.dataAgendada).toISOString().split("T")[0];
    return dataStr < hojeStr;
  }).length;

  return (
    <>
      <Topbar
        title="Entregas"
        subtitle={`${total} registro${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}`}
        actions={!isReadOnly ?
          <Button onClick={() => setShowModal(true)}>
            <Plus size={15} /> Nova Entrega
          </Button>
        : undefined}
      />

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
        {/* Filtro atrasadas ativo (via notificação) */}
        {atrasadas && (
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm"
            style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", color: "#ef4444" }}>
            <span>Filtrando: <strong>Entregas atrasadas</strong> (prazo vencido e não entregue)</span>
            <button onClick={() => { setAtrasadas(false); router.replace("/entregas"); }} className="ml-2 hover:opacity-70"><X size={14} /></button>
          </div>
        )}
        {/* Alert atrasadas na página */}
        {!atrasadas && atrasadasCount > 0 && (
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm"
            style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", color: "#ef4444" }}>
            <strong>{atrasadasCount}</strong> entrega(s) com prazo vencido nesta pagina
          </div>
        )}

        {/* Filters */}
        <Card className="p-3 sm:p-4">
          <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
            <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar NF, cidade, endereço, cliente, motorista..."
                className="w-full pl-9 pr-9 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--border)] transition-colors" style={{ color: "var(--text3)" }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "var(--text2)" }}>
              <input type="checkbox" checked={mostrarFinalizados} onChange={(e) => setMostrarFinalizados(e.target.checked)}
                className="accent-orange-500 w-3.5 h-3.5" />
              Mostrar finalizados
            </label>
            <Button variant="ghost" size="sm" onClick={() => setShowFiltros((v: boolean) => !v)}
              className={(dynamicFilters.length > 0 || agendadaDe || agendadaAte) ? "bg-orange-50 text-orange-600" : ""}>
              <Filter size={13} /> Filtros {(() => {
                const count = dynamicFilters.length + ((agendadaDe || agendadaAte) ? 1 : 0);
                return count > 0 ? `(${count})` : "";
              })()}
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchEntregas}>
              <RefreshCw size={13} /> Atualizar
            </Button>
          </div>

          {/* Filter Panel (date + dynamic filters) */}
          {(showFiltros || dynamicFilters.length > 0 || agendadaDe || agendadaAte) && (
            <div className="mt-4 pt-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
              {/* Data Agendada */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text3)" }}>
                  <Calendar size={11} /> Data agendada
                </div>
                <input
                  type="date"
                  value={agendadaDe}
                  onChange={(e) => { setAgendadaDe(e.target.value); setPage(1); }}
                  className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <span className="text-xs" style={{ color: "var(--text3)" }}>até</span>
                <input
                  type="date"
                  value={agendadaAte}
                  onChange={(e) => { setAgendadaAte(e.target.value); setPage(1); }}
                  className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                {(agendadaDe || agendadaAte) && (
                  <button
                    onClick={() => { setAgendadaDe(""); setAgendadaAte(""); setPage(1); }}
                    className="text-[11px] font-medium px-2 py-1 rounded-lg transition-all hover:bg-red-50"
                    style={{ color: "#ef4444" }}
                  >
                    <X size={11} className="inline -mt-px mr-0.5" /> Limpar data
                  </button>
                )}
              </div>

              {/* Dynamic Filters Header */}
              <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "var(--text3)" }}>
                  <Filter size={11} /> Filtros {dynamicFilters.length > 0 ? `ativos (${dynamicFilters.length})` : "por campo"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={addFilter}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all hover:scale-105"
                    style={{ color: "#f97316", background: "rgba(249,115,22,0.08)" }}>
                    <Plus size={11} className="inline -mt-px mr-0.5" /> Adicionar filtro
                  </button>
                  <button
                    onClick={clearAllFilters}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all hover:bg-red-50"
                    style={{ color: "#ef4444" }}>
                    <Trash2 size={11} className="inline -mt-px mr-0.5" /> Limpar todos
                  </button>
                </div>
              </div>

              {dynamicFilters.map((f, idx) => {
                const opt = FILTER_OPTIONS.find((o) => o.value === f.field);
                return (
                  <div key={f.id}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-xl transition-all animate-in slide-in-from-top-1"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    {/* Connector label */}
                    <span className="text-[10px] font-bold uppercase w-6 text-center flex-shrink-0 hidden sm:block"
                      style={{ color: "var(--text3)" }}>
                      {idx === 0 ? "" : "E"}
                    </span>

                    {/* Field Selector */}
                    <select
                      value={f.field}
                      onChange={(e) => updateFilter(f.id, { field: e.target.value, value: "" })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium outline-none flex-shrink-0 cursor-pointer w-full sm:w-auto"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", minWidth: "140px" }}>
                      {FILTER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>

                    {/* Operator label */}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 hidden sm:inline"
                      style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>
                      contém
                    </span>

                    {/* Value Input */}
                    {opt?.type === "select" ? (
                      <select
                        value={f.value}
                        onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
                        <option value="">Selecione...</option>
                        {STATUS_OPTIONS.filter((s) => s.value).map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={opt?.type || "text"}
                        value={f.value}
                        onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                        placeholder={opt?.placeholder || "Digite o valor..."}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                        autoFocus={idx === dynamicFilters.length - 1 && !f.value}
                      />
                    )}

                    {/* Remove button */}
                    <button
                      onClick={() => removeFilter(f.id)}
                      className="p-1.5 rounded-lg flex-shrink-0 transition-all hover:scale-110"
                      style={{ color: "var(--text3)" }}
                      title="Remover filtro">
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Table */}
        <Card className="p-0 overflow-hidden">
          {loading ? <Loading /> : entregas.length === 0 ? <Empty icon="📦" text="Nenhuma entrega encontrada" /> : (
            <>
              {/* Mobile: card list */}
              <div className="block md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
                {entregas.map((e) => {
                  const dataStr = e.dataAgendada ? new Date(e.dataAgendada).toISOString().split("T")[0] : null;
                  const isAtrasada = dataStr && dataStr < hojeStr && !["ENTREGUE", "FINALIZADO"].includes(e.status);
                  return (
                    <div key={e.id} onClick={() => router.push(`/entregas/${e.id}`)}
                      className="p-3 cursor-pointer active:bg-slate-50 transition-colors"
                      style={isAtrasada ? { borderLeft: "3px solid #ef4444" } : {}}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[11px] font-bold" style={{ color: "var(--accent)" }}>
                          {e.notas?.length > 0 ? e.notas.map((n: any) => `NF ${n.numero}`).join(", ") : e.codigo}
                        </span>
                        <StatusBadge status={e.status} />
                      </div>
                      <div className="text-sm font-semibold truncate">{e.razaoSocial}</div>
                      <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: "var(--text3)" }}>
                        <span>{e.cidade}{e.uf ? ` - ${e.uf}` : ""}</span>
                        {e.motorista?.nome && <span><Truck size={10} className="inline mr-0.5" />{e.motorista.nome}</span>}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text3)" }}>
                          {e.volumeTotal > 0 && <span>{e.volumeTotal} vol</span>}
                          {e.pesoTotal > 0 && <span>{formatWeight(e.pesoTotal)}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {e.valorFrete > 0 && <span className="text-[11px] font-mono" style={{ color: "#10b981" }}>{formatCurrency(e.valorFrete)}</span>}
                          <div className="flex flex-col items-end">
                            {e.dataChegada && <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>Chegada: {formatDate(e.dataChegada)}</span>}
                            <span className={`text-[11px] font-mono ${isAtrasada ? "text-red-400 font-bold" : ""}`} style={!isAtrasada ? { color: "var(--text3)" } : {}}>
                              {formatDate(e.dataAgendada)}{isAtrasada ? " !" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <SortTh col="codigo" label="Número da NF" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <Th>Fornecedor</Th>
                    <SortTh col="razaoSocial" label="Cliente" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <SortTh col="cidade" label="Cidade / UF" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <SortTh col="volumeTotal" label="Volumes" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <SortTh col="pesoTotal" label="Peso" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <SortTh col="motorista" label="Motorista" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <SortTh col="dataChegada" label="Chegada" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <SortTh col="dataAgendada" label="Agendado" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <SortTh col="dataEntrega" label="Entregue" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <SortTh col="status" label="Status" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <SortTh col="valorFrete" label="Frete" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <SortTh col="valorDescarga" label="Descarga" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} />
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {entregas.map((e) => {
                    const dataStr = e.dataAgendada ? new Date(e.dataAgendada).toISOString().split("T")[0] : null;
                    const atrasada = dataStr && dataStr < hojeStr && !["ENTREGUE", "FINALIZADO"].includes(e.status);
                    return (
                      <Tr key={e.id} onClick={() => router.push(`/entregas/${e.id}`)}
                        className={atrasada ? "border-l-2" : ""}
                        style={atrasada ? { borderLeftColor: "#ef4444" } as any : {}}>
                        <Td>
                          {e.notas && e.notas.length > 0 ? (
                            <div className="space-y-0.5 py-0.5">
                              {e.notas.map((n: any) => (
                                <div key={n.id} className="font-mono text-[11px] font-bold leading-tight" style={{ color: "var(--accent)" }}>
                                  NF {n.numero}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="font-mono text-sm leading-tight" style={{ color: "#3b82f6" }}>
                              {e.codigo}
                            </div>
                          )}
                        </Td>
                        <Td>
                          {(() => {
                            const fornecedor = e.notas && e.notas.length > 0
                              ? Array.from(new Set(e.notas.filter((n: any) => n.emitenteRazao).map((n: any) => n.emitenteRazao))).join(", ") || "—"
                              : "—";
                            return (
                              <span className="text-xs block max-w-[160px] truncate" title={fornecedor} style={{ color: "var(--text2)" }}>
                                {fornecedor}
                              </span>
                            );
                          })()}
                        </Td>
                        <Td>
                          <div className="font-semibold text-sm leading-tight max-w-[200px] truncate" title={e.razaoSocial}>{e.razaoSocial}</div>
                          <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text3)" }}>{formatCNPJ(e.cnpj)}</div>
                        </Td>
                        <Td>
                          <span className="text-xs block max-w-[140px] truncate" title={`${e.cidade}${e.uf ? ` - ${e.uf}` : ""}`} style={{ color: "var(--text2)" }}>
                            {e.cidade}{e.uf ? ` — ${e.uf}` : ""}
                          </span>
                        </Td>
                        <Td><span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface2)", color: "var(--text2)" }}>{e.volumeTotal || 0}</span></Td>
                        <Td><span className="text-xs font-mono whitespace-nowrap" style={{ color: "var(--text2)" }}>{formatWeight(e.pesoTotal)}</span></Td>
                        <Td>
                          <span className="text-xs block max-w-[140px] truncate" title={e.motorista?.nome || ""} style={{ color: "var(--text2)" }}>
                            {e.motorista?.nome || <span style={{ color: "var(--text3)" }}>—</span>}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-xs font-mono whitespace-nowrap" style={{ color: "var(--text3)" }}>
                            {formatDate(e.dataChegada)}
                          </span>
                        </Td>
                        <Td>
                          <span className={`text-xs font-mono whitespace-nowrap ${atrasada ? "text-red-400" : ""}`} style={!atrasada ? { color: "var(--text3)" } : {}}>
                            {formatDate(e.dataAgendada)}{atrasada ? " ⚠" : ""}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-xs font-mono whitespace-nowrap" style={{ color: e.dataEntrega ? "#059669" : "var(--text3)" }}>
                            {e.dataEntrega ? formatDate(e.dataEntrega) : "—"}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex flex-col items-start gap-1.5">
                            <StatusBadge status={e.status} />
                            {QUALIDADE_ENABLED && e.qualidade?.id && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1"
                                style={{ background: "rgba(234, 179, 8, 0.15)", color: "#ca8a04", border: "1px solid rgba(234, 179, 8, 0.3)" }}
                                title="Entrega possui registro de Qualidade">
                                ⭐ Avaliada
                              </span>
                            )}
                            {e.diarias?.length > 0 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1"
                                style={{ background: "rgba(217,119,6,.15)", color: "#d97706", border: "1px solid rgba(217,119,6,.3)" }}
                                title={`${e.diarias.length} diária(s) — clique na entrega pra ver`}>
                                💰 Diária{e.diarias.length > 1 ? `s (${e.diarias.length})` : ""}
                              </span>
                            )}
                          </div>
                        </Td>
                        <Td><span className="text-xs font-mono" style={{ color: "#10b981" }}>{formatCurrency(e.valorFrete)}</span></Td>
                        <Td>
                          {!isReadOnly ? (
                            <button
                              onClick={(ev) => { ev.stopPropagation(); editarDescarga(e.id, e.valorDescarga || 0); }}
                              className="text-xs font-mono px-2 py-1 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors cursor-pointer"
                              style={{ color: e.valorDescarga > 0 ? "#f97316" : "var(--text3)" }}
                              title="Clique para editar descarga"
                            >
                              {formatCurrency(e.valorDescarga || 0)}
                            </button>
                          ) : (
                            <span className="text-xs font-mono" style={{ color: e.valorDescarga > 0 ? "#f97316" : "var(--text3)" }}>{formatCurrency(e.valorDescarga || 0)}</span>
                          )}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            {!isReadOnly && (
                              <button className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                                style={{ background: "var(--surface2)", color: "#ef4444" }}
                                onClick={(ev) => { ev.stopPropagation(); deleteEntrega(e.id); }}
                                title="Excluir (Somente Admin)">
                                <Trash2 size={13} />
                              </button>
                            )}
                            {!isReadOnly && (
                              <button className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                                style={{ background: "var(--surface2)", color: "#3b82f6" }}
                                onClick={(ev) => { ev.stopPropagation(); setSugestaoEntregaId(e.id); }}
                                title="Sugerir veículo">
                                <Truck size={13} />
                              </button>
                            )}
                            <button className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                              style={{ background: "var(--surface2)", color: "var(--text2)" }}
                              onClick={(ev) => { ev.stopPropagation(); router.push(`/entregas/${e.id}`); }}
                              title="Visualizar">
                              <Eye size={13} />
                            </button>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
              </div>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>
                    Página {page} de {pages} · {total} registros
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((p: number) => p - 1)}>
                      <ChevronLeft size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" disabled={page === pages} onClick={() => setPage((p: number) => p + 1)}>
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setForm({ ...BLANK_FORM }); setShowComplFields(false); }} title="Nova Entrega" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Input label="CNPJ *" value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
          <Input label="Razão Social *" value={form.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} />
          <Input label="Cidade *" value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
          <Input label="UF" value={form.uf} onChange={(e) => set("uf", e.target.value)} maxLength={2} />
          <Input label="Endereço" value={form.endereco} onChange={(e) => set("endereco", e.target.value)} className="sm:col-span-2" />
          <Input label="Bairro" value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
          <Input label="CEP" value={form.cep} onChange={(e) => set("cep", e.target.value)} />
          <Input label="Data Chegada" type="date" value={form.dataChegada} onChange={(e) => set("dataChegada", e.target.value)} />
          <Input label="Data Agendada" type="date" value={form.dataAgendada} onChange={(e) => set("dataAgendada", e.target.value)} />

          <ComboboxMotorista motoristas={motoristas} veiculos={veiculos} value={form.motoristaId} onChange={(id) => set("motoristaId", id)} onAutoFillVeiculo={(vid) => set("veiculoId", vid)} />
          <Select label="Veículo (Auto-completo)" value={form.veiculoId} onChange={(e) => set("veiculoId", e.target.value)}>
            <option value="">Selecionar...</option>
            {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.tipo}</option>)}
          </Select>

          {!showComplFields ? (
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-center border-dashed border-2 py-3 hover:bg-slate-50 dark:hover:bg-slate-900"
                onClick={() => setShowComplFields(true)}
              >
                <Plus size={14} className="mr-2" /> Adicionar Motorista Complementar (Carga Complementar)
              </Button>
            </div>
          ) : (
            <>
              <div className="sm:col-span-2 flex items-center justify-between py-2 border-b text-[10px] font-bold text-slate-400 uppercase">
                <span>Motorista Complementar</span>
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700 text-xs font-semibold normal-case"
                  onClick={() => {
                    set("motoristaComplId", "");
                    set("veiculoComplId", "");
                    set("valorMotoristaCompl", "");
                    set("valorSaidaCompl", "");
                    set("adiantamentoMotoristaCompl", "");
                    set("descontosMotoristaCompl", "");
                    set("dataAdiantamentoCompl", "");
                    set("dataPagamentoSaldoCompl", "");
                    set("statusCanhotoCompl", "PENDENTE");
                    setShowComplFields(false);
                  }}
                >
                  Remover
                </button>
              </div>
              
              <ComboboxMotorista
                motoristas={motoristas}
                veiculos={veiculos}
                value={form.motoristaComplId}
                onChange={(id) => set("motoristaComplId", id)}
                onAutoFillVeiculo={(vid) => set("veiculoComplId", vid)}
                label="Motorista Complementar"
              />
              <Select
                label="Veículo Complementar"
                value={form.veiculoComplId}
                onChange={(e) => set("veiculoComplId", e.target.value)}
              >
                <option value="">Selecionar...</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} — {v.tipo}
                  </option>
                ))}
              </Select>

              <Input
                label="Valor Combinado Complementar"
                type="number"
                value={form.valorMotoristaCompl}
                onChange={(e) => set("valorMotoristaCompl", e.target.value)}
                placeholder="0,00"
              />
              <Input
                label="Pedágio/Saída Complementar"
                type="number"
                value={form.valorSaidaCompl}
                onChange={(e) => set("valorSaidaCompl", e.target.value)}
                placeholder="0,00"
              />
              <Input
                label="Adiantamento Complementar"
                type="number"
                value={form.adiantamentoMotoristaCompl}
                onChange={(e) => set("adiantamentoMotoristaCompl", e.target.value)}
                placeholder="0,00"
              />
              <Input
                label="Descontos Complementar"
                type="number"
                value={form.descontosMotoristaCompl}
                onChange={(e) => set("descontosMotoristaCompl", e.target.value)}
                placeholder="0,00"
              />
              
              <Input
                label="Data Adiantamento Compl."
                type="date"
                value={form.dataAdiantamentoCompl}
                onChange={(e) => set("dataAdiantamentoCompl", e.target.value)}
              />
              <Input
                label="Data Pagamento Saldo Compl."
                type="date"
                value={form.dataPagamentoSaldoCompl}
                onChange={(e) => set("dataPagamentoSaldoCompl", e.target.value)}
              />
              
              <Select
                label="Status do Canhoto Compl."
                value={form.statusCanhotoCompl}
                onChange={(e) => set("statusCanhotoCompl", e.target.value)}
                className="sm:col-span-2"
              >
                <option value="PENDENTE">Pendente</option>
                <option value="RECEBIDO">Recebido</option>
                <option value="COM_RESSALVA">Com Ressalva</option>
              </Select>
            </>
          )}

          <div className="sm:col-span-2">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: "var(--text3)", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>Financeiro (Faturamento Cliente)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input label="Valor Frete" type="number" step="0.01" value={form.valorFrete} onChange={(e) => set("valorFrete", e.target.value)} placeholder="0,00" />
              <Input label="Descarga" type="number" step="0.01" value={form.valorDescarga} onChange={(e) => set("valorDescarga", e.target.value)} placeholder="0,00" />
              <Input label="Armazenagem" type="number" step="0.01" value={form.valorArmazenagem} onChange={(e) => set("valorArmazenagem", e.target.value)} placeholder="0,00" />
              <Input label="Adiantamento" type="number" step="0.01" value={form.adiantamento} onChange={(e) => set("adiantamento", e.target.value)} placeholder="0,00" />
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: "var(--text3)", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>Financeiro (Motorista Principal)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input label="Valor Combinado Motorista" type="number" step="0.01" value={form.valorMotorista} onChange={(e) => set("valorMotorista", e.target.value)} placeholder="0,00" />
              <Input label="Pedágio/Saída Motorista" type="number" step="0.01" value={form.valorSaida} onChange={(e) => set("valorSaida", e.target.value)} placeholder="0,00" />
              <Input label="Adiantamento Motorista" type="number" step="0.01" value={form.adiantamentoMotorista} onChange={(e) => set("adiantamentoMotorista", e.target.value)} placeholder="0,00" />
              <Input label="Descontos Motorista" type="number" step="0.01" value={form.descontosMotorista} onChange={(e) => set("descontosMotorista", e.target.value)} placeholder="0,00" />
              <Input label="Data Adiantamento Motorista" type="date" value={form.dataAdiantamento} onChange={(e) => set("dataAdiantamento", e.target.value)} className="col-span-2 sm:col-span-2" />
              <Input label="Data Pagamento Saldo Motorista" type="date" value={form.dataPagamentoSaldo} onChange={(e) => set("dataPagamentoSaldo", e.target.value)} className="col-span-2 sm:col-span-2" />
              <Select label="Status do Canhoto" value={form.statusCanhoto} onChange={(e) => set("statusCanhoto", e.target.value)} className="col-span-2 sm:col-span-4">
                <option value="PENDENTE">Pendente</option>
                <option value="RECEBIDO">Recebido</option>
                <option value="COM_RESSALVA">Com Ressalva</option>
              </Select>
            </div>
          </div>

          <Textarea label="Observações" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} className="sm:col-span-2" />
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Criar Entrega</Button>
        </div>
      </Modal>

      <SugestaoVeiculoModal
        open={sugestaoEntregaId !== null}
        onClose={() => setSugestaoEntregaId(null)}
        entregaId={sugestaoEntregaId}
        onAtribuido={fetchEntregas}
      />
    </>
  );
}
