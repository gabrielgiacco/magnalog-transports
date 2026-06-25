"use client";
import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, Empty, StatusBadge, Modal, Input, Table, Th, Td, Tr, Select } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RefreshCw, Edit2, Search, DollarSign, Clock, CheckCircle, Download, FileSignature, AlertCircle, HandCoins, CalendarDays, Pencil, ArrowUp, ArrowDown } from "lucide-react";

type PeriodoPreset = "todos" | "semanal" | "quinzenal" | "mensal";

function getPresetDates(preset: PeriodoPreset): { inicio: string; fim: string } {
  const hoje = new Date();
  let inicio = "";
  let fim = "";

  if (preset === "semanal") {
    // Semana: Domingo a Sábado da semana atual
    const dom = new Date(hoje);
    dom.setDate(dom.getDate() - dom.getDay()); // volta para domingo
    const sab = new Date(dom);
    sab.setDate(sab.getDate() + 6); // avança para sábado
    inicio = dom.toISOString().slice(0, 10);
    fim = sab.toISOString().slice(0, 10);
  } else if (preset === "quinzenal") {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 15);
    inicio = d.toISOString().slice(0, 10);
    fim = hoje.toISOString().slice(0, 10);
  } else if (preset === "mensal") {
    const d = new Date(hoje);
    d.setMonth(d.getMonth() - 1);
    inicio = d.toISOString().slice(0, 10);
    fim = hoje.toISOString().slice(0, 10);
  }

  return { inicio, fim };
}

export function AcertoMotoristasTab({ embedded = false }: { embedded?: boolean } = {}) {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [totais, setTotais] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [pendente, setPendente] = useState(true);

  // Date filters
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [periodoAtivo, setPeriodoAtivo] = useState<PeriodoPreset>("todos");
  
  const [showEdit, setShowEdit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // New states for Previsão Tab & Bulk Selection
  const [abaAtiva, setAbaAtiva] = useState<"acertos" | "previsao">("acertos");
  const [selectedIds, setSelectedIds] = useState<{ id: string, isRota: boolean }[]>([]);
  const [showBulkPredict, setShowBulkPredict] = useState(false);
  const [bulkDate, setBulkDate] = useState("");

  // Column Filters
  const [filterMotorista, setFilterMotorista] = useState("");
  const [filterDataFrete, setFilterDataFrete] = useState("");
  const [filterFreteCombinado, setFilterFreteCombinado] = useState<number | null>(null);
  const [filterValesSaida, setFilterValesSaida] = useState<number | null>(null);
  const [filterDescarga, setFilterDescarga] = useState<number | null>(null);
  const [filterAdiantamento, setFilterAdiantamento] = useState<number | null>(null);
  const [filterDesconto, setFilterDesconto] = useState<number | null>(null);
  const [filterSaldo, setFilterSaldo] = useState<number | null>(null);
  const [filterDataPgto, setFilterDataPgto] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Sorting states
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    params.set("aba", abaAtiva);
    if (search) params.set("cliente", search);
    if (pendente) params.set("pendente", "true");
    if (dataInicio) params.set("dataInicio", dataInicio);
    if (dataFim) params.set("dataFim", dataFim);
    const res = await fetch(`/api/financeiro?${params}`);
    const data = await res.json();
    setEntregas(data.entregas || []);
    setTotais(data.totais || {});
    setTotal(data.total || 0);
    setPages(data.pages || 1);
    setLoading(false);
    setSelectedIds([]); // Clear selection when data changes
  }, [page, search, pendente, dataInicio, dataFim, abaAtiva]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Click outside header dropdowns to close them
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (openDropdown && !(e.target as HTMLElement).closest("th")) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  // Filtered deliveries locally on frontend (for responsive filtering)
  const filteredEntregas = entregas.filter(e => {
    if (filterMotorista) {
      const nomeMoto = e.motorista?.nome || "";
      if (!nomeMoto.toLowerCase().includes(filterMotorista.toLowerCase())) return false;
    }
    if (filterDataFrete) {
      const dateStr = e.dataEntrega || e.dataAgendada || "";
      if (!dateStr) return false;
      const formatted = new Date(dateStr).toISOString().slice(0, 10);
      if (formatted !== filterDataFrete) return false;
    }
    if (filterFreteCombinado !== null) {
      if (e.valorMotorista !== filterFreteCombinado) return false;
    }
    if (filterValesSaida !== null) {
      if (e.valorSaida !== filterValesSaida) return false;
    }
    if (filterDescarga !== null) {
      if (e.valorDescarga !== filterDescarga) return false;
    }
    if (filterAdiantamento !== null) {
      if (e.adiantamentoMotorista !== filterAdiantamento) return false;
    }
    if (filterDesconto !== null) {
      if (e.descontosMotorista !== filterDesconto) return false;
    }
    if (filterSaldo !== null) {
      if (e.saldoMotorista !== filterSaldo) return false;
    }
    if (filterDataPgto) {
      const dateStr = e.dataPagamentoSaldo || "";
      if (!dateStr) return false;
      const formatted = new Date(dateStr).toISOString().slice(0, 10);
      if (formatted !== filterDataPgto) return false;
    }
    return true;
  });

  // Sort filtered deliveries locally on frontend
  const sortedEntregas = [...filteredEntregas].sort((a, b) => {
    if (!sortColumn || !sortDirection) return 0;

    let valA: any = "";
    let valB: any = "";

    switch (sortColumn) {
      case "motorista":
        valA = a.motorista?.nome || "";
        valB = b.motorista?.nome || "";
        break;
      case "dataFrete":
        valA = a.dataEntrega || a.dataAgendada || "";
        valB = b.dataEntrega || b.dataAgendada || "";
        break;
      case "freteCombinado":
        valA = a.valorMotorista ?? 0;
        valB = b.valorMotorista ?? 0;
        break;
      case "valesSaida":
        valA = a.valorSaida ?? 0;
        valB = b.valorSaida ?? 0;
        break;
      case "descarga":
        valA = a.valorDescarga ?? 0;
        valB = b.valorDescarga ?? 0;
        break;
      case "adiantamento":
        valA = a.adiantamentoMotorista ?? 0;
        valB = b.adiantamentoMotorista ?? 0;
        break;
      case "desconto":
        valA = a.descontosMotorista ?? 0;
        valB = b.descontosMotorista ?? 0;
        break;
      case "saldo":
        valA = a.saldoMotorista ?? 0;
        valB = b.saldoMotorista ?? 0;
        break;
      case "dataPgto":
        valA = a.dataPagamentoSaldo || "";
        valB = b.dataPagamentoSaldo || "";
        break;
      default:
        return 0;
    }

    if (typeof valA === "string" && typeof valB === "string") {
      return sortDirection === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    }

    if (typeof valA === "number" && typeof valB === "number") {
      return sortDirection === "asc" ? valA - valB : valB - valA;
    }

    return 0;
  });

  // Unique values for dropdown filters
  const uniqueMotoristas = Array.from(new Set(entregas.map(e => e.motorista?.nome).filter(Boolean))).sort() as string[];
  const uniqueDatesFrete = Array.from(new Set(entregas.map(e => {
    const d = e.dataEntrega || e.dataAgendada || "";
    return d ? new Date(d).toISOString().slice(0, 10) : "";
  }).filter(Boolean))).sort() as string[];
  const uniqueFreteCombinado = Array.from(new Set(entregas.map(e => e.valorMotorista).filter(v => v !== undefined && v !== null))).sort((a,b)=>a-b) as number[];
  const uniqueValesSaida = Array.from(new Set(entregas.map(e => e.valorSaida).filter(v => v !== undefined && v !== null))).sort((a,b)=>a-b) as number[];
  const uniqueDescarga = Array.from(new Set(entregas.map(e => e.valorDescarga).filter(v => v !== undefined && v !== null))).sort((a,b)=>a-b) as number[];
  const uniqueAdiantamento = Array.from(new Set(entregas.map(e => e.adiantamentoMotorista).filter(v => v !== undefined && v !== null))).sort((a,b)=>a-b) as number[];
  const uniqueDesconto = Array.from(new Set(entregas.map(e => e.descontosMotorista).filter(v => v !== undefined && v !== null))).sort((a,b)=>a-b) as number[];
  const uniqueSaldo = Array.from(new Set(entregas.map(e => e.saldoMotorista).filter(v => v !== undefined && v !== null))).sort((a,b)=>a-b) as number[];
  const uniqueDatesPgto = Array.from(new Set(entregas.map(e => {
    const d = e.dataPagamentoSaldo || "";
    return d ? new Date(d).toISOString().slice(0, 10) : "";
  }).filter(Boolean))).sort() as string[];

  // Recalculate totals dynamically
  const filteredTotais = filteredEntregas.reduce((acc: any, v: any) => {
    const saldoPendenteViagem = v.dataPagamentoSaldo ? 0 : v.saldoMotorista;
    return {
      valorMotorista: (acc.valorMotorista || 0) + v.valorMotorista,
      adiantamentoMotorista: (acc.adiantamentoMotorista || 0) + (v.adiantamentoMotorista || 0),
      saldoMotorista: (acc.saldoMotorista || 0) + saldoPendenteViagem,
      valorSaida: (acc.valorSaida || 0) + (v.valorSaida || 0),
      valorDescarga: (acc.valorDescarga || 0) + (v.valorDescarga || 0),
      descontosMotorista: (acc.descontosMotorista || 0) + (v.descontosMotorista || 0),
    };
  }, { valorMotorista: 0, adiantamentoMotorista: 0, saldoMotorista: 0, valorSaida: 0, valorDescarga: 0, descontosMotorista: 0 });

  function handlePresetChange(preset: PeriodoPreset) {
    setPeriodoAtivo(preset);
    if (preset === "todos") {
      setDataInicio("");
      setDataFim("");
    } else {
      const { inicio, fim } = getPresetDates(preset);
      setDataInicio(inicio);
      setDataFim(fim);
    }
    setPage(1);
  }

  function handleDateChange(field: "inicio" | "fim", value: string) {
    setPeriodoAtivo("todos"); // Clear preset when using custom dates
    if (field === "inicio") setDataInicio(value);
    else setDataFim(value);
    setPage(1);
  }

  function openEdit(e: any) {
    setEditingId(e.id);
    // Determine the freight date: for routes use rota.data (dataEntrega), for direct use dataAgendada or dataEntrega
    const freteDate = e.dataEntrega || e.dataAgendada || "";
    setEditForm({
      valorMotorista: String(e.valorMotorista || 0),
      valorSaida: String(e.valorSaida || 0),
      valorDescarga: String(e.valorDescarga || 0),
      adiantamentoMotorista: String(e.adiantamentoMotorista || 0),
      dataAdiantamento: e.dataAdiantamento ? e.dataAdiantamento.slice(0, 10) : "",
      descontosMotorista: String(e.descontosMotorista || 0),
      dataPagamentoSaldo: e.dataPagamentoSaldo ? e.dataPagamentoSaldo.slice(0, 10) : "",
      statusCanhoto: e.statusCanhoto || "PENDENTE",
      dataFrete: freteDate ? new Date(freteDate).toISOString().slice(0, 10) : "",
    });
    setShowEdit(true);
  }

  async function handleSave() {
    if (!editingId) return;
    setSaving(true);
    try {
      const editingViagem = entregas.find(e => e.id === editingId);
      const res = await fetch("/api/financeiro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          isRota: editingViagem?.isRota || false,
          valorMotorista: parseFloat(editForm.valorMotorista) || 0,
          valorSaida: parseFloat(editForm.valorSaida) || 0,
          valorDescarga: parseFloat(editForm.valorDescarga) || 0,
          adiantamentoMotorista: parseFloat(editForm.adiantamentoMotorista) || 0,
          dataAdiantamento: editForm.dataAdiantamento || null,
          descontosMotorista: parseFloat(editForm.descontosMotorista) || 0,
          dataPagamentoSaldo: editForm.dataPagamentoSaldo || null,
          statusCanhoto: editForm.statusCanhoto,
          dataFrete: editForm.dataFrete || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Acerto atualizado com sucesso");
      setShowEdit(false);
      fetchData();
    } catch { toast.error("Erro ao salvar acerto"); }
    finally { setSaving(false); }
  }

  async function handleBulkSave() {
    if (selectedIds.length === 0 || !bulkDate) return;
    setSaving(true);
    try {
      const res = await fetch("/api/financeiro/agendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedIds,
          dataPagamentoSaldo: bulkDate,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Pagamentos agendados com sucesso!");
      setShowBulkPredict(false);
      setBulkDate("");
      fetchData();
    } catch { toast.error("Erro ao agendar pagamentos"); }
    finally { setSaving(false); }
  }

  async function handleBulkRemove() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Tem certeza que deseja remover a previsão de pagamento de ${selectedIds.length} viagem(ns)?`)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/financeiro/agendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedIds,
          dataPagamentoSaldo: null, // Remove prediction
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Previsões removidas com sucesso!");
      setSelectedIds([]);
      fetchData();
    } catch { toast.error("Erro ao remover previsões"); }
    finally { setSaving(false); }
  }

  const set = (k: string, v: string) => setEditForm((f: any) => ({ ...f, [k]: v }));

  const currentSaldoEdit = 
    (parseFloat(editForm.valorMotorista)||0) - 
    (parseFloat(editForm.adiantamentoMotorista)||0) - 
    (parseFloat(editForm.valorSaida)||0) - 
    (parseFloat(editForm.descontosMotorista)||0);

  // Helper: display NF column correctly
  // For routes: show route code (e.g. RTA-0018)
  // For direct deliveries: show NF numbers
  function getIdentificador(e: any) {
    if (e.isRota) {
      return e.codigo; // Always show route code for routes
    }
    // Direct delivery: show NF numbers if available, otherwise the entrega code
    if (e.notas && e.notas.length > 0) {
      return e.notas.map((n: any) => n.numero).join(", ");
    }
    return e.codigo;
  }

  const presetButtons: { label: string; value: PeriodoPreset }[] = [
    { label: "Todos", value: "todos" },
    { label: "Semanal", value: "semanal" },
    { label: "Quinzenal", value: "quinzenal" },
    { label: "Mensal", value: "mensal" },
  ];

  return (
    <>
      {!embedded && (
        <Topbar title="Acerto de Motoristas" subtitle={`${filteredEntregas.length} de ${total} viagens · Controle de Pagamentos de Terceiros`}
          actions={
            <Button variant="ghost" size="sm" onClick={() => window.open("/api/export?tipo=financeiro-motoristas", "_blank")}>
              <Download size={14} /> Exportar CSV
            </Button>
          }
        />
      )}

      <div className={embedded ? "space-y-3 sm:space-y-4 relative" : "flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 relative"}>
        {embedded && (
          <div className="flex justify-between items-center text-xs" style={{ color: "var(--text2)" }}>
            <span>{filteredEntregas.length} de {total} viagens</span>
            <Button variant="ghost" size="sm" onClick={() => window.open("/api/export?tipo=financeiro-motoristas", "_blank")}>
              <Download size={14} /> Exportar CSV
            </Button>
          </div>
        )}
        {/* Tabs */}
        <div className="flex items-center gap-6 border-b" style={{ borderColor: "var(--border)" }}>
          <button 
            className={`pb-3 font-head font-bold text-sm transition-colors ${abaAtiva === "acertos" ? "text-rose-600 border-b-2 border-rose-600" : "text-gray-400 hover:text-gray-600"}`}
            onClick={() => setAbaAtiva("acertos")}
          >
            Acertos Pendentes
          </button>
          <button 
            className={`pb-3 font-head font-bold text-sm transition-colors ${abaAtiva === "previsao" ? "text-rose-600 border-b-2 border-rose-600" : "text-gray-400 hover:text-gray-600"}`}
            onClick={() => setAbaAtiva("previsao")}
          >
            Previsões de Pagamento
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
          <Card className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(249,115,22,.1)", border: "1px solid rgba(249,115,22,.25)" }}>
              <HandCoins size={16} style={{ color: "#f97316" }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase truncate" style={{ color: "var(--text3)" }}>Combinado</div>
              <div className="font-head text-xs sm:text-sm font-black truncate" style={{ color: "#f97316" }}>{formatCurrency(filteredTotais.valorMotorista ?? 0)}</div>
            </div>
          </Card>
          <Card className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.25)" }}>
              <DollarSign size={16} style={{ color: "#3b82f6" }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase truncate" style={{ color: "var(--text3)" }}>Adiantado</div>
              <div className="font-head text-xs sm:text-sm font-black truncate" style={{ color: "#3b82f6" }}>{formatCurrency(filteredTotais.adiantamentoMotorista ?? 0)}</div>
            </div>
          </Card>
          <Card className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.25)" }}>
              <AlertCircle size={16} style={{ color: "#10b981" }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase truncate" style={{ color: "var(--text3)" }}>Vales</div>
              <div className="font-head text-xs sm:text-sm font-black truncate" style={{ color: "#10b981" }}>{formatCurrency(filteredTotais.valorSaida ?? 0)}</div>
            </div>
          </Card>
          <Card className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)" }}>
              <FileSignature size={16} style={{ color: "#ef4444" }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase truncate" style={{ color: "var(--text3)" }}>Descontos</div>
              <div className="font-head text-xs sm:text-sm font-black truncate" style={{ color: "#ef4444" }}>{formatCurrency(filteredTotais.descontosMotorista ?? 0)}</div>
            </div>
          </Card>
          <Card className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border border-rose-200 col-span-2 sm:col-span-1">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(244,63,94,.1)", border: "1px solid rgba(244,63,94,.25)" }}>
              <Clock size={16} style={{ color: "#f43f5e" }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase font-bold text-rose-500">Saldo Pendente</div>
              <div className="font-head text-sm sm:text-lg font-black text-rose-600">{formatCurrency(filteredTotais.saldoMotorista ?? 0)}</div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-3 sm:p-4 space-y-3">
          <div className="flex gap-2 sm:gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por nome do motorista ou NF..."
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none text-rose-600">
              <input type="checkbox" checked={pendente} onChange={(e) => { setPendente(e.target.checked); setPage(1); }}
                className="accent-rose-500 w-4 h-4 cursor-pointer" />
              Somente com saldo a pagar
            </label>
            <Button variant="ghost" size="sm" onClick={fetchData}><RefreshCw size={13} /> Atualizar</Button>
          </div>

          {/* Date range + period presets */}
          <div className="flex gap-2 sm:gap-3 items-center flex-wrap pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold uppercase" style={{ color: "var(--text3)" }}>
              <CalendarDays size={14} />
              Periodo:
            </div>

            {/* Preset buttons */}
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              {presetButtons.map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => handlePresetChange(btn.value)}
                  className="px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold transition-all"
                  style={{
                    background: periodoAtivo === btn.value ? "var(--accent)" : "transparent",
                    color: periodoAtivo === btn.value ? "#fff" : "var(--text2)",
                    borderRight: "1px solid var(--border)",
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto flex-wrap">
              <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
                <span className="text-[10px] font-mono uppercase" style={{ color: "var(--text3)" }}>De:</span>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => handleDateChange("inicio", e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-xs outline-none flex-1 sm:flex-initial"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </div>
              <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
                <span className="text-[10px] font-mono uppercase" style={{ color: "var(--text3)" }}>Ate:</span>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => handleDateChange("fim", e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-xs outline-none flex-1 sm:flex-initial"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </div>
              {(dataInicio || dataFim) && (
                <button
                  onClick={() => { handlePresetChange("todos"); }}
                  className="text-[10px] font-bold text-rose-500 hover:text-rose-600 px-2 py-1 rounded-md hover:bg-rose-50 transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Active Column Filters Badges */}
        {(filterMotorista || filterDataFrete || filterFreteCombinado !== null || filterValesSaida !== null || filterDescarga !== null || filterAdiantamento !== null || filterDesconto !== null || filterSaldo !== null || filterDataPgto) && (
          <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-[var(--surface2)] border border-[var(--border)] items-center">
            <span className="text-xs font-mono uppercase text-rose-500 font-bold ml-1">Filtros:</span>
            {filterMotorista && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-1.5">
                Motorista: {filterMotorista}
                <button onClick={() => setFilterMotorista("")} className="hover:opacity-75 font-bold">×</button>
              </span>
            )}
            {filterDataFrete && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-1.5">
                Data: {formatDate(filterDataFrete)}
                <button onClick={() => setFilterDataFrete("")} className="hover:opacity-75 font-bold">×</button>
              </span>
            )}
            {filterFreteCombinado !== null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-1.5">
                Combinado: {formatCurrency(filterFreteCombinado)}
                <button onClick={() => setFilterFreteCombinado(null)} className="hover:opacity-75 font-bold">×</button>
              </span>
            )}
            {filterValesSaida !== null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-1.5">
                Vales: {formatCurrency(filterValesSaida)}
                <button onClick={() => setFilterValesSaida(null)} className="hover:opacity-75 font-bold">×</button>
              </span>
            )}
            {filterDescarga !== null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-1.5">
                Descarga: {formatCurrency(filterDescarga)}
                <button onClick={() => setFilterDescarga(null)} className="hover:opacity-75 font-bold">×</button>
              </span>
            )}
            {filterAdiantamento !== null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-1.5">
                Adiantamento: {formatCurrency(filterAdiantamento)}
                <button onClick={() => setFilterAdiantamento(null)} className="hover:opacity-75 font-bold">×</button>
              </span>
            )}
            {filterDesconto !== null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-1.5">
                Desconto: {formatCurrency(filterDesconto)}
                <button onClick={() => setFilterDesconto(null)} className="hover:opacity-75 font-bold">×</button>
              </span>
            )}
            {filterSaldo !== null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-1.5">
                Saldo: {formatCurrency(filterSaldo)}
                <button onClick={() => setFilterSaldo(null)} className="hover:opacity-75 font-bold">×</button>
              </span>
            )}
            {filterDataPgto && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-1.5">
                Pgto: {formatDate(filterDataPgto)}
                <button onClick={() => setFilterDataPgto("")} className="hover:opacity-75 font-bold">×</button>
              </span>
            )}
            <button
              onClick={() => {
                setFilterMotorista("");
                setFilterDataFrete("");
                setFilterFreteCombinado(null);
                setFilterValesSaida(null);
                setFilterDescarga(null);
                setFilterAdiantamento(null);
                setFilterDesconto(null);
                setFilterSaldo(null);
                setFilterDataPgto("");
              }}
              className="text-xs font-bold text-rose-500 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50 transition-colors ml-auto"
            >
              Limpar Todos
            </button>
          </div>
        )}

        {/* Table */}
        <Card className="p-0 overflow-hidden shadow">
          {loading ? <Loading /> : filteredEntregas.length === 0 ? <Empty icon="" text="Nenhum acerto de viagem pendente." /> : (
            <>
            <div className="block lg:hidden divide-y" style={{ borderColor: "var(--border)" }}>
              {filteredEntregas.map((e) => {
                const isSelected = selectedIds.some(s => s.id === e.id);
                return (
                <div key={e.id} className={`p-3 transition-colors active:bg-slate-50 ${e.isDiariaExtra ? "opacity-60" : ""} ${isSelected ? "bg-rose-50/40" : ""}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <input type="checkbox" className="accent-rose-500 w-4 h-4 cursor-pointer"
                        checked={isSelected}
                        onChange={(ev) => {
                          if (ev.target.checked) setSelectedIds(prev => [...prev, { id: e.id, isRota: e.isRota }]);
                          else setSelectedIds(prev => prev.filter(s => s.id !== e.id));
                        }}
                      />
                      <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${e.isRota ? "bg-orange-100 text-orange-700 border border-orange-200" : "bg-blue-100 text-blue-700 border border-blue-200"}`}>
                        {e.isRota ? "Rota" : "Direta"}
                      </span>
                      <span className="font-mono text-xs font-bold text-gray-700 truncate">{getIdentificador(e)}</span>
                      {e.isDiariaPrincipal && e.diariaQtdViagens > 1 && (
                        <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          DIARIA {e.diariaQtdSaidas} {e.diariaQtdSaidas === 1 ? "saida" : "saidas"}{e.diariaQtdDiretas > 0 && e.diariaQtdRotas > 0 ? ` + ${e.diariaQtdDiretas} dir.` : ""}
                        </span>
                      )}
                      {e.isDiariaExtra && (
                        <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-gray-100 text-gray-400 border border-gray-200">
                          Incluso na diaria
                        </span>
                      )}
                    </div>
                    <StatusBadge status={e.statusCanhoto || "PENDENTE"} />
                  </div>
                  <div onClick={() => setFilterMotorista(e.motorista?.nome || "")} className="font-bold text-sm text-gray-800 uppercase truncate cursor-pointer hover:underline">{e.motorista?.nome || "Motorista nao vinculado"}</div>
                  <div onClick={() => {
                    const d = e.dataEntrega || e.dataAgendada || "";
                    if (d) setFilterDataFrete(new Date(d).toISOString().slice(0, 10));
                  }} className="text-[10px] text-gray-400 font-mono truncate cursor-pointer hover:underline">Para: {e.cidade} - {formatDate(e.dataEntrega || e.dataAgendada) || "-"}</div>
                  <div className="grid grid-cols-2 gap-1.5 mt-2 text-[11px]">
                    <div onClick={() => setFilterFreteCombinado(e.valorMotorista)} className="cursor-pointer hover:underline"><span className="text-gray-400">Combinado: </span><span className="font-mono font-bold text-orange-500">{formatCurrency(e.valorMotorista)}</span></div>
                    <div onClick={() => setFilterValesSaida(e.valorSaida)} className="cursor-pointer hover:underline"><span className="text-gray-400">Vales: </span><span className="font-mono text-gray-600">{formatCurrency(e.valorSaida)}</span></div>
                    <div onClick={() => setFilterAdiantamento(e.adiantamentoMotorista)} className="cursor-pointer hover:underline"><span className="text-gray-400">Adiant.: </span><span className="font-mono text-blue-500 font-bold">{formatCurrency(e.adiantamentoMotorista)}</span></div>
                    <div onClick={() => setFilterDesconto(e.descontosMotorista)} className="cursor-pointer hover:underline"><span className="text-gray-400">Desc.: </span><span className="font-mono text-red-500 font-bold">{formatCurrency(e.descontosMotorista)}</span></div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <div>
                      <div className="text-[9px] uppercase font-bold text-rose-500">Saldo</div>
                      <div onClick={() => setFilterSaldo(e.saldoMotorista)} className={`font-mono text-sm font-black cursor-pointer hover:underline ${e.saldoMotorista > 0 ? "text-rose-600" : "text-emerald-500"}`}>
                        {formatCurrency(e.saldoMotorista)}
                      </div>
                    </div>
                    <button onClick={() => openEdit(e)}
                      className="px-3 py-2 rounded-lg text-xs font-bold transition-all bg-gray-800 text-white hover:bg-gray-700">
                      Acerto
                    </button>
                  </div>
                </div>
                );
              })}
            </div>

            <div className="hidden lg:block pb-20">
            <Table>
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <Th className="w-10 text-center">
                    <input type="checkbox" className="accent-rose-500 w-4 h-4 cursor-pointer"
                      checked={filteredEntregas.length > 0 && selectedIds.length === filteredEntregas.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(filteredEntregas.map(ent => ({ id: ent.id, isRota: ent.isRota })));
                        else setSelectedIds([]);
                      }}
                    />
                  </Th>
                  <Th>NF / Rota</Th>
                  <Th className="relative">
                    <div className="flex items-center gap-1 cursor-pointer select-none" onClick={() => setOpenDropdown(openDropdown === "motorista" ? null : "motorista")}>
                      <span>Motorista</span>
                      {sortColumn === "motorista" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} className="text-rose-500" /> : <ArrowDown size={10} className="text-rose-500" />
                      ) : (
                        <Search size={10} className={filterMotorista ? "text-rose-500" : "text-gray-400"} />
                      )}
                    </div>
                    {openDropdown === "motorista" && (
                      <div className="absolute left-0 mt-1.5 w-60 rounded-xl shadow-2xl p-2.5 z-50 text-left font-normal" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="flex gap-1 mb-2 pb-2 border-b border-[var(--border)]">
                          <button
                            onClick={() => { setSortColumn("motorista"); setSortDirection("asc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "motorista" && sortDirection === "asc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowUp size={10} /> Crescente
                          </button>
                          <button
                            onClick={() => { setSortColumn("motorista"); setSortDirection("desc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "motorista" && sortDirection === "desc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowDown size={10} /> Decrescente
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Buscar motorista..."
                          value={filterMotorista}
                          onChange={e => setFilterMotorista(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none mb-2 font-normal"
                          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                        />
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {uniqueMotoristas
                             .filter(m => m.toLowerCase().includes(filterMotorista.toLowerCase()))
                             .map(moto => (
                              <button
                                key={moto}
                                onClick={() => { setFilterMotorista(moto); setOpenDropdown(null); }}
                                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[var(--surface2)] truncate font-medium block"
                                style={{ color: "var(--text2)" }}
                              >
                                {moto}
                              </button>
                            ))}
                        </div>
                        {(filterMotorista || sortColumn === "motorista") && (
                          <button
                            onClick={() => { setFilterMotorista(""); if (sortColumn === "motorista") { setSortColumn(null); setSortDirection(null); } setOpenDropdown(null); }}
                            className="w-full text-center mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-rose-500 hover:text-rose-600 block"
                          >
                            Limpar Filtros / Ordenação
                          </button>
                        )}
                      </div>
                    )}
                  </Th>
                  <Th className="relative">
                    <div className="flex items-center gap-1 cursor-pointer select-none" onClick={() => setOpenDropdown(openDropdown === "dataFrete" ? null : "dataFrete")}>
                      <span>Data Frete</span>
                      {sortColumn === "dataFrete" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} className="text-rose-500" /> : <ArrowDown size={10} className="text-rose-500" />
                      ) : (
                        <Search size={10} className={filterDataFrete ? "text-rose-500" : "text-gray-400"} />
                      )}
                    </div>
                    {openDropdown === "dataFrete" && (
                      <div className="absolute left-0 mt-1.5 w-52 rounded-xl shadow-2xl p-2.5 z-50 text-left font-normal" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="flex gap-1 mb-2 pb-2 border-b border-[var(--border)]">
                          <button
                            onClick={() => { setSortColumn("dataFrete"); setSortDirection("asc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "dataFrete" && sortDirection === "asc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowUp size={10} /> Crescente
                          </button>
                          <button
                            onClick={() => { setSortColumn("dataFrete"); setSortDirection("desc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "dataFrete" && sortDirection === "desc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowDown size={10} /> Decrescente
                          </button>
                        </div>
                        <input
                          type="date"
                          value={filterDataFrete}
                          onChange={e => { setFilterDataFrete(e.target.value); setOpenDropdown(null); }}
                          className="w-full px-2 py-1.5 rounded-lg text-xs outline-none mb-2 font-normal"
                          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                        />
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {uniqueDatesFrete.map(dt => (
                            <button
                              key={dt}
                              onClick={() => { setFilterDataFrete(dt); setOpenDropdown(null); }}
                              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[var(--surface2)] font-mono block"
                              style={{ color: "var(--text2)" }}
                            >
                              {formatDate(dt)}
                            </button>
                          ))}
                        </div>
                        {(filterDataFrete || sortColumn === "dataFrete") && (
                          <button
                            onClick={() => { setFilterDataFrete(""); if (sortColumn === "dataFrete") { setSortColumn(null); setSortDirection(null); } setOpenDropdown(null); }}
                            className="w-full text-center mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-rose-500 hover:text-rose-600 block"
                          >
                            Limpar Filtros / Ordenação
                          </button>
                        )}
                      </div>
                    )}
                  </Th>
                  <Th>Canhoto</Th>
                  <Th className="text-right relative">
                    <div className="flex items-center justify-end gap-1 cursor-pointer select-none" onClick={() => setOpenDropdown(openDropdown === "freteCombinado" ? null : "freteCombinado")}>
                      <span>Frete Combinado</span>
                      {sortColumn === "freteCombinado" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} className="text-rose-500" /> : <ArrowDown size={10} className="text-rose-500" />
                      ) : (
                        <Search size={10} className={filterFreteCombinado !== null ? "text-rose-500" : "text-gray-400"} />
                      )}
                    </div>
                    {openDropdown === "freteCombinado" && (
                      <div className="absolute right-0 mt-1.5 w-48 rounded-xl shadow-2xl p-2.5 z-50 text-left font-normal" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="flex gap-1 mb-2 pb-2 border-b border-[var(--border)]">
                          <button
                            onClick={() => { setSortColumn("freteCombinado"); setSortDirection("asc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "freteCombinado" && sortDirection === "asc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowUp size={10} /> Crescente
                          </button>
                          <button
                            onClick={() => { setSortColumn("freteCombinado"); setSortDirection("desc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "freteCombinado" && sortDirection === "desc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowDown size={10} /> Decrescente
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {uniqueFreteCombinado.map(v => (
                            <button
                              key={v}
                              onClick={() => { setFilterFreteCombinado(v); setOpenDropdown(null); }}
                              className="w-full text-right px-2 py-1.5 rounded text-xs hover:bg-[var(--surface2)] font-mono font-medium block"
                              style={{ color: "var(--text2)" }}
                            >
                              {formatCurrency(v)}
                            </button>
                          ))}
                        </div>
                        {(filterFreteCombinado !== null || sortColumn === "freteCombinado") && (
                          <button
                            onClick={() => { setFilterFreteCombinado(null); if (sortColumn === "freteCombinado") { setSortColumn(null); setSortDirection(null); } setOpenDropdown(null); }}
                            className="w-full text-center mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-rose-500 hover:text-rose-600 block"
                          >
                            Limpar Filtros / Ordenação
                          </button>
                        )}
                      </div>
                    )}
                  </Th>
                  <Th className="text-right relative">
                    <div className="flex items-center justify-end gap-1 cursor-pointer select-none" onClick={() => setOpenDropdown(openDropdown === "valesSaida" ? null : "valesSaida")}>
                      <span>Vales / Saída</span>
                      {sortColumn === "valesSaida" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} className="text-rose-500" /> : <ArrowDown size={10} className="text-rose-500" />
                      ) : (
                        <Search size={10} className={filterValesSaida !== null ? "text-rose-500" : "text-gray-400"} />
                      )}
                    </div>
                    {openDropdown === "valesSaida" && (
                      <div className="absolute right-0 mt-1.5 w-48 rounded-xl shadow-2xl p-2.5 z-50 text-left font-normal" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="flex gap-1 mb-2 pb-2 border-b border-[var(--border)]">
                          <button
                            onClick={() => { setSortColumn("valesSaida"); setSortDirection("asc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "valesSaida" && sortDirection === "asc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowUp size={10} /> Crescente
                          </button>
                          <button
                            onClick={() => { setSortColumn("valesSaida"); setSortDirection("desc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "valesSaida" && sortDirection === "desc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowDown size={10} /> Decrescente
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {uniqueValesSaida.map(v => (
                            <button
                              key={v}
                              onClick={() => { setFilterValesSaida(v); setOpenDropdown(null); }}
                              className="w-full text-right px-2 py-1.5 rounded text-xs hover:bg-[var(--surface2)] font-mono font-medium block"
                              style={{ color: "var(--text2)" }}
                            >
                              {formatCurrency(v)}
                            </button>
                          ))}
                        </div>
                        {(filterValesSaida !== null || sortColumn === "valesSaida") && (
                          <button
                            onClick={() => { setFilterValesSaida(null); if (sortColumn === "valesSaida") { setSortColumn(null); setSortDirection(null); } setOpenDropdown(null); }}
                            className="w-full text-center mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-rose-500 hover:text-rose-600 block"
                          >
                            Limpar Filtros / Ordenação
                          </button>
                        )}
                      </div>
                    )}
                  </Th>
                  <Th className="text-right relative">
                    <div className="flex items-center justify-end gap-1 cursor-pointer select-none" onClick={() => setOpenDropdown(openDropdown === "descarga" ? null : "descarga")}>
                      <span>Descarga</span>
                      {sortColumn === "descarga" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} className="text-rose-500" /> : <ArrowDown size={10} className="text-rose-500" />
                      ) : (
                        <Search size={10} className={filterDescarga !== null ? "text-rose-500" : "text-gray-400"} />
                      )}
                    </div>
                    {openDropdown === "descarga" && (
                      <div className="absolute right-0 mt-1.5 w-48 rounded-xl shadow-2xl p-2.5 z-50 text-left font-normal" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="flex gap-1 mb-2 pb-2 border-b border-[var(--border)]">
                          <button
                            onClick={() => { setSortColumn("descarga"); setSortDirection("asc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "descarga" && sortDirection === "asc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowUp size={10} /> Crescente
                          </button>
                          <button
                            onClick={() => { setSortColumn("descarga"); setSortDirection("desc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "descarga" && sortDirection === "desc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowDown size={10} /> Decrescente
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {uniqueDescarga.map(v => (
                            <button
                              key={v}
                              onClick={() => { setFilterDescarga(v); setOpenDropdown(null); }}
                              className="w-full text-right px-2 py-1.5 rounded text-xs hover:bg-[var(--surface2)] font-mono font-medium block"
                              style={{ color: "var(--text2)" }}
                            >
                              {formatCurrency(v)}
                            </button>
                          ))}
                        </div>
                        {(filterDescarga !== null || sortColumn === "descarga") && (
                          <button
                            onClick={() => { setFilterDescarga(null); if (sortColumn === "descarga") { setSortColumn(null); setSortDirection(null); } setOpenDropdown(null); }}
                            className="w-full text-center mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-rose-500 hover:text-rose-600 block"
                          >
                            Limpar Filtros / Ordenação
                          </button>
                        )}
                      </div>
                    )}
                  </Th>
                  <Th className="text-right relative">
                    <div className="flex items-center justify-end gap-1 cursor-pointer select-none" onClick={() => setOpenDropdown(openDropdown === "adiantamento" ? null : "adiantamento")}>
                      <span>Adiantamento</span>
                      {sortColumn === "adiantamento" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} className="text-rose-500" /> : <ArrowDown size={10} className="text-rose-500" />
                      ) : (
                        <Search size={10} className={filterAdiantamento !== null ? "text-rose-500" : "text-gray-400"} />
                      )}
                    </div>
                    {openDropdown === "adiantamento" && (
                      <div className="absolute right-0 mt-1.5 w-48 rounded-xl shadow-2xl p-2.5 z-50 text-left font-normal" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="flex gap-1 mb-2 pb-2 border-b border-[var(--border)]">
                          <button
                            onClick={() => { setSortColumn("adiantamento"); setSortDirection("asc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "adiantamento" && sortDirection === "asc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowUp size={10} /> Crescente
                          </button>
                          <button
                            onClick={() => { setSortColumn("adiantamento"); setSortDirection("desc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "adiantamento" && sortDirection === "desc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowDown size={10} /> Decrescente
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {uniqueAdiantamento.map(v => (
                            <button
                              key={v}
                              onClick={() => { setFilterAdiantamento(v); setOpenDropdown(null); }}
                              className="w-full text-right px-2 py-1.5 rounded text-xs hover:bg-[var(--surface2)] font-mono font-medium block"
                              style={{ color: "var(--text2)" }}
                            >
                              {formatCurrency(v)}
                            </button>
                          ))}
                        </div>
                        {(filterAdiantamento !== null || sortColumn === "adiantamento") && (
                          <button
                            onClick={() => { setFilterAdiantamento(null); if (sortColumn === "adiantamento") { setSortColumn(null); setSortDirection(null); } setOpenDropdown(null); }}
                            className="w-full text-center mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-rose-500 hover:text-rose-600 block"
                          >
                            Limpar Filtros / Ordenação
                          </button>
                        )}
                      </div>
                    )}
                  </Th>
                  <Th className="text-right relative">
                    <div className="flex items-center justify-end gap-1 cursor-pointer select-none" onClick={() => setOpenDropdown(openDropdown === "desconto" ? null : "desconto")}>
                      <span>Desconto</span>
                      {sortColumn === "desconto" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} className="text-rose-500" /> : <ArrowDown size={10} className="text-rose-500" />
                      ) : (
                        <Search size={10} className={filterDesconto !== null ? "text-rose-500" : "text-gray-400"} />
                      )}
                    </div>
                    {openDropdown === "desconto" && (
                      <div className="absolute right-0 mt-1.5 w-48 rounded-xl shadow-2xl p-2.5 z-50 text-left font-normal" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="flex gap-1 mb-2 pb-2 border-b border-[var(--border)]">
                          <button
                            onClick={() => { setSortColumn("desconto"); setSortDirection("asc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "desconto" && sortDirection === "asc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowUp size={10} /> Crescente
                          </button>
                          <button
                            onClick={() => { setSortColumn("desconto"); setSortDirection("desc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "desconto" && sortDirection === "desc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowDown size={10} /> Decrescente
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {uniqueDesconto.map(v => (
                            <button
                              key={v}
                              onClick={() => { setFilterDesconto(v); setOpenDropdown(null); }}
                              className="w-full text-right px-2 py-1.5 rounded text-xs hover:bg-[var(--surface2)] font-mono font-medium block"
                              style={{ color: "var(--text2)" }}
                            >
                              {formatCurrency(v)}
                            </button>
                          ))}
                        </div>
                        {(filterDesconto !== null || sortColumn === "desconto") && (
                          <button
                            onClick={() => { setFilterDesconto(null); if (sortColumn === "desconto") { setSortColumn(null); setSortDirection(null); } setOpenDropdown(null); }}
                            className="w-full text-center mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-rose-500 hover:text-rose-600 block"
                          >
                            Limpar Filtros / Ordenação
                          </button>
                        )}
                      </div>
                    )}
                  </Th>
                  <Th className="text-right bg-rose-50 text-rose-700 relative">
                    <div className="flex items-center justify-end gap-1 cursor-pointer select-none" onClick={() => setOpenDropdown(openDropdown === "saldo" ? null : "saldo")}>
                      <span>Saldo a Pagar</span>
                      {sortColumn === "saldo" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} className="text-rose-500" /> : <ArrowDown size={10} className="text-rose-500" />
                      ) : (
                        <Search size={10} className={filterSaldo !== null ? "text-rose-500" : "text-gray-400"} />
                      )}
                    </div>
                    {openDropdown === "saldo" && (
                      <div className="absolute right-0 mt-1.5 w-48 rounded-xl shadow-2xl p-2.5 z-50 text-left font-normal" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="flex gap-1 mb-2 pb-2 border-b border-[var(--border)]">
                          <button
                            onClick={() => { setSortColumn("saldo"); setSortDirection("asc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "saldo" && sortDirection === "asc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowUp size={10} /> Crescente
                          </button>
                          <button
                            onClick={() => { setSortColumn("saldo"); setSortDirection("desc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "saldo" && sortDirection === "desc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowDown size={10} /> Decrescente
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {uniqueSaldo.map(v => (
                            <button
                              key={v}
                              onClick={() => { setFilterSaldo(v); setOpenDropdown(null); }}
                              className="w-full text-right px-2 py-1.5 rounded text-xs hover:bg-[var(--surface2)] font-mono font-medium block"
                              style={{ color: "var(--text2)" }}
                            >
                              {formatCurrency(v)}
                            </button>
                          ))}
                        </div>
                        {(filterSaldo !== null || sortColumn === "saldo") && (
                          <button
                            onClick={() => { setFilterSaldo(null); if (sortColumn === "saldo") { setSortColumn(null); setSortDirection(null); } setOpenDropdown(null); }}
                            className="w-full text-center mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-rose-500 hover:text-rose-600 block"
                          >
                            Limpar Filtros / Ordenação
                          </button>
                        )}
                      </div>
                    )}
                  </Th>
                  <Th className="relative">
                    <div className="flex items-center gap-1 cursor-pointer select-none" onClick={() => setOpenDropdown(openDropdown === "dataPgto" ? null : "dataPgto")}>
                      <span>Data Pgto</span>
                      {sortColumn === "dataPgto" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} className="text-rose-500" /> : <ArrowDown size={10} className="text-rose-500" />
                      ) : (
                        <Search size={10} className={filterDataPgto ? "text-rose-500" : "text-gray-400"} />
                      )}
                    </div>
                    {openDropdown === "dataPgto" && (
                      <div className="absolute right-0 mt-1.5 w-52 rounded-xl shadow-2xl p-2.5 z-50 text-left font-normal" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="flex gap-1 mb-2 pb-2 border-b border-[var(--border)]">
                          <button
                            onClick={() => { setSortColumn("dataPgto"); setSortDirection("asc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "dataPgto" && sortDirection === "asc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowUp size={10} /> Crescente
                          </button>
                          <button
                            onClick={() => { setSortColumn("dataPgto"); setSortDirection("desc"); setOpenDropdown(null); }}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[10px] font-bold border transition-colors ${sortColumn === "dataPgto" && sortDirection === "desc" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:opacity-85"}`}
                          >
                            <ArrowDown size={10} /> Decrescente
                          </button>
                        </div>
                        <input
                          type="date"
                          value={filterDataPgto}
                          onChange={e => { setFilterDataPgto(e.target.value); setOpenDropdown(null); }}
                          className="w-full px-2 py-1.5 rounded-lg text-xs outline-none mb-2 font-normal"
                          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                        />
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {uniqueDatesPgto.map(dt => (
                            <button
                              key={dt}
                              onClick={() => { setFilterDataPgto(dt); setOpenDropdown(null); }}
                              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[var(--surface2)] font-mono block"
                              style={{ color: "var(--text2)" }}
                            >
                              {formatDate(dt)}
                            </button>
                          ))}
                        </div>
                        {(filterDataPgto || sortColumn === "dataPgto") && (
                          <button
                            onClick={() => { setFilterDataPgto(""); if (sortColumn === "dataPgto") { setSortColumn(null); setSortDirection(null); } setOpenDropdown(null); }}
                            className="w-full text-center mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-rose-500 hover:text-rose-600 block"
                          >
                            Limpar Filtros / Ordenação
                          </button>
                        )}
                      </div>
                    )}
                  </Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {sortedEntregas.map((e) => {
                  const isSelected = selectedIds.some(s => s.id === e.id);
                  return (
                  <Tr key={e.id} className={`hover:bg-slate-50 transition-colors ${e.isDiariaExtra ? "opacity-50" : ""} ${isSelected ? "bg-rose-50/40" : ""}`}>
                    <Td className="text-center">
                      <input type="checkbox" className="accent-rose-500 w-4 h-4 cursor-pointer"
                        checked={isSelected}
                        onChange={(ev) => {
                          if (ev.target.checked) setSelectedIds(prev => [...prev, { id: e.id, isRota: e.isRota }]);
                          else setSelectedIds(prev => prev.filter(s => s.id !== e.id));
                        }}
                      />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${e.isRota ? "bg-orange-100 text-orange-700 border border-orange-200" : "bg-blue-100 text-blue-700 border border-blue-200"}`}>
                          {e.isRota ? "Rota" : "Direta"}
                        </span>
                        <span className="font-mono text-xs font-bold text-gray-700">
                          {getIdentificador(e)}
                        </span>
                        {e.isDiariaExtra && (
                          <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-gray-100 text-gray-400 border border-gray-200">
                            Incluso na diaria
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td onClick={() => setFilterMotorista(e.motorista?.nome || "")} className="cursor-pointer hover:bg-rose-50/50 transition-colors">
                      <div className="font-bold text-sm text-gray-800 uppercase hover:underline">{e.motorista?.nome || "Motorista não vinculado"}</div>
                      <div className="text-[10px] text-gray-400 font-mono">
                        {e.isDiariaPrincipal && e.diariaQtdViagens > 1
                          ? <span className="text-emerald-600 font-bold">Diaria — {e.diariaQtdSaidas} {e.diariaQtdSaidas === 1 ? "saida" : "saidas"} no dia{e.diariaQtdDiretas > 0 && e.diariaQtdRotas > 0 ? ` + ${e.diariaQtdDiretas} direta(s)` : ""}</span>
                          : `Rota para: ${e.cidade}`
                        }
                      </div>
                    </Td>
                    <Td onClick={() => {
                      const d = e.dataEntrega || e.dataAgendada || "";
                      if (d) setFilterDataFrete(new Date(d).toISOString().slice(0, 10));
                    }} className="cursor-pointer hover:bg-rose-50/50 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold hover:underline" style={{ color: "var(--text2)" }}>
                          {formatDate(e.dataEntrega || e.dataAgendada) || "-"}
                        </span>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                          className="p-0.5 rounded hover:bg-amber-100 transition-colors group"
                          title="Editar data do frete"
                        >
                          <Pencil size={11} className="text-gray-300 group-hover:text-amber-600 transition-colors" />
                        </button>
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge status={e.statusCanhoto || "PENDENTE"} />
                    </Td>
                    <Td onClick={() => setFilterFreteCombinado(e.valorMotorista)} className="cursor-pointer hover:bg-rose-50/50 transition-colors text-right">
                      <span className={`font-mono text-sm font-bold hover:underline ${e.isDiariaExtra ? "text-gray-300" : "text-orange-500"}`}>{formatCurrency(e.valorMotorista)}</span>
                    </Td>
                    <Td onClick={() => setFilterValesSaida(e.valorSaida)} className="cursor-pointer hover:bg-rose-50/50 transition-colors text-right">
                      <span className="font-mono text-xs text-gray-500 hover:underline">{formatCurrency(e.valorSaida)}</span>
                    </Td>
                    <Td onClick={() => setFilterDescarga(e.valorDescarga)} className="cursor-pointer hover:bg-rose-50/50 transition-colors text-right">
                      <span className="font-mono text-xs text-gray-500 hover:underline">{formatCurrency(e.valorDescarga)}</span>
                    </Td>
                    <Td onClick={() => setFilterAdiantamento(e.adiantamentoMotorista)} className="cursor-pointer hover:bg-rose-50/50 transition-colors text-right text-gray-500">
                        <div className="font-mono text-xs text-blue-500 font-bold hover:underline">{formatCurrency(e.adiantamentoMotorista)}</div>
                        <div className="text-[9px] font-mono">{formatDate(e.dataAdiantamento)}</div>
                    </Td>
                    <Td onClick={() => setFilterDesconto(e.descontosMotorista)} className="cursor-pointer hover:bg-rose-50/50 transition-colors text-right">
                      <span className="font-mono text-xs text-red-500 font-bold hover:underline">{formatCurrency(e.descontosMotorista)}</span>
                    </Td>
                    <Td onClick={() => setFilterSaldo(e.saldoMotorista)} className="cursor-pointer hover:bg-rose-50/50 transition-colors text-right bg-rose-50/30">
                      <span className={`font-mono text-sm font-black hover:underline ${e.saldoMotorista > 0 ? "text-rose-600" : "text-emerald-500"}`}>
                        {formatCurrency(e.saldoMotorista)}
                      </span>
                    </Td>
                    <Td onClick={() => {
                      const d = e.dataPagamentoSaldo || "";
                      if (d) setFilterDataPgto(new Date(d).toISOString().slice(0, 10));
                    }} className="cursor-pointer hover:bg-rose-50/50 transition-colors">
                      <span className="font-mono text-[10px] font-bold hover:underline" style={{ color: "var(--text3)" }}>{formatDate(e.dataPagamentoSaldo) || "-"}</span>
                    </Td>
                    <Td>
                      <button onClick={() => openEdit(e)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-gray-800 text-white hover:bg-gray-700">
                        Acerto
                      </button>
                    </Td>
                  </Tr>
                  );
                })}
              </tbody>
            </Table>
            </div>
            </>
          )}
        </Card>
      </div>

      {/* Floating Action Bar */}
      {selectedIds.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-4 z-50 animate-in slide-in-from-bottom-5">
          <span className="text-sm font-bold font-mono">{selectedIds.length} selecionados</span>
          <Button size="sm" onClick={() => setShowBulkPredict(true)} className="bg-rose-500 hover:bg-rose-600 text-white border-none rounded-full px-4">
            <CalendarDays size={14} className="mr-2" /> Agendar
          </Button>
          <Button size="sm" onClick={handleBulkRemove} disabled={saving} className="bg-gray-700 hover:bg-gray-600 text-white border-none rounded-full px-4">
            Remover Previsão
          </Button>
          <button onClick={() => setSelectedIds([])} className="w-6 h-6 flex items-center justify-center hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors" title="Limpar Seleção">
            ×
          </button>
        </div>
      )}

      {/* Bulk Predict Modal */}
      <Modal open={showBulkPredict} onClose={() => setShowBulkPredict(false)} title="Agendar Pagamentos" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Defina a data de previsão de pagamento para as <strong>{selectedIds.length}</strong> viagens selecionadas.</p>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Data de Previsão</label>
            <Input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <Button variant="ghost" onClick={() => setShowBulkPredict(false)}>Cancelar</Button>
            <Button onClick={handleBulkSave} disabled={saving || !bulkDate} className="bg-rose-600 hover:bg-rose-700 text-white">
              {saving ? "Salvando..." : "Confirmar Agendamento"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Fechar Acerto do Terceiro" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* Data do Frete - highlighted section */}
          <div className="sm:col-span-3 border border-amber-200 bg-amber-50 p-3 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays size={14} className="text-amber-700" />
              <div className="text-xs font-bold text-amber-800 uppercase">Data do Frete</div>
            </div>
            <Input label="Data da Rota / Entrega" type="date" value={editForm.dataFrete} onChange={(e) => set("dataFrete", e.target.value)} />
          </div>

          <Input label="Valor Combinado (Frete)" type="number" step="0.01" value={editForm.valorMotorista} onChange={(e) => set("valorMotorista", e.target.value)} />
          <Input label="Vales / Saída (Pedágio)" type="number" step="0.01" value={editForm.valorSaida} onChange={(e) => set("valorSaida", e.target.value)} />
          <Input label="Descarga" type="number" step="0.01" value={editForm.valorDescarga} onChange={(e) => set("valorDescarga", e.target.value)} />
          
          <div className="border border-blue-100 bg-blue-50 p-3 rounded-xl space-y-3">
             <div className="text-xs font-bold text-blue-800 uppercase">Adiantamento</div>
             <Input label="R$ Adiantado" type="number" step="0.01" value={editForm.adiantamentoMotorista} onChange={(e) => set("adiantamentoMotorista", e.target.value)} />
             <Input label="Data de Liberação" type="date" value={editForm.dataAdiantamento} onChange={(e) => set("dataAdiantamento", e.target.value)} />
          </div>

          <div className="border border-red-100 bg-red-50 p-3 rounded-xl space-y-3">
             <div className="text-xs font-bold text-red-800 uppercase">Avarias / Controle</div>
             <Select label="Status do Canhoto NF" value={editForm.statusCanhoto} onChange={(e) => set("statusCanhoto", e.target.value)}>
                <option value="PENDENTE">Pendente</option>
                <option value="RECEBIDO">Recebido Assinado</option>
                <option value="COM_RESSALVA">Com Ressalva</option>
             </Select>
             <Input label="R$ Desconto Falta" type="number" step="0.01" value={editForm.descontosMotorista} onChange={(e) => set("descontosMotorista", e.target.value)} />
          </div>

          <div className="sm:col-span-3 mt-2 p-3 sm:p-4 rounded-xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3" style={{ background: "rgba(244,63,94,.08)", border: "1px solid rgba(244,63,94,.25)" }}>
            <div>
                <div className="text-xs uppercase font-bold text-rose-800">Saldo Restante Calculado:</div>
                <div className="font-head text-2xl sm:text-3xl font-black mt-1" style={{ color: currentSaldoEdit > 0 ? "#e11d48" : "#10b981" }}>
                {formatCurrency(currentSaldoEdit)}
                </div>
            </div>

            <div className="text-left sm:text-right w-full sm:w-auto">
                <Input label="Data Pgto Quitacao" type="date" value={editForm.dataPagamentoSaldo} onChange={(e) => set("dataPagamentoSaldo", e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mt-6 pt-4 border-t border-gray-100">
           <div className="text-[10px] text-gray-500 font-mono">Saldo = Combinado - Saida - Adiantamento - Desconto</div>
           <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancelar</Button>
            <Button className="bg-gray-800 text-white" onClick={handleSave} loading={saving}>Salvar Acerto</Button>
           </div>
        </div>
      </Modal>
    </>
  );
}
