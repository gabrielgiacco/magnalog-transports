"use client";
import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, Empty, StatusBadge, Modal, Input, Table, Th, Td, Tr, Select } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RefreshCw, Edit2, Search, DollarSign, Clock, CheckCircle, Download, FileSignature, AlertCircle, HandCoins, CalendarDays, Pencil } from "lucide-react";

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

export function AcertoMotoristasTab() {
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
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
  }, [page, search, pendente, dataInicio, dataFim]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      <Topbar title="Acerto de Motoristas" subtitle={`${total} viagens · Controle de Pagamentos de Terceiros`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => window.open("/api/export?tipo=financeiro-motoristas", "_blank")}>
            <Download size={14} /> Exportar CSV
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
          <Card className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(249,115,22,.1)", border: "1px solid rgba(249,115,22,.25)" }}>
              <HandCoins size={16} style={{ color: "#f97316" }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase truncate" style={{ color: "var(--text3)" }}>Combinado</div>
              <div className="font-head text-xs sm:text-sm font-black truncate" style={{ color: "#f97316" }}>{formatCurrency(totais.valorMotorista ?? 0)}</div>
            </div>
          </Card>
          <Card className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.25)" }}>
              <DollarSign size={16} style={{ color: "#3b82f6" }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase truncate" style={{ color: "var(--text3)" }}>Adiantado</div>
              <div className="font-head text-xs sm:text-sm font-black truncate" style={{ color: "#3b82f6" }}>{formatCurrency(totais.adiantamentoMotorista ?? 0)}</div>
            </div>
          </Card>
          <Card className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.25)" }}>
              <AlertCircle size={16} style={{ color: "#10b981" }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase truncate" style={{ color: "var(--text3)" }}>Vales</div>
              <div className="font-head text-xs sm:text-sm font-black truncate" style={{ color: "#10b981" }}>{formatCurrency(totais.valorSaida ?? 0)}</div>
            </div>
          </Card>
          <Card className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)" }}>
              <FileSignature size={16} style={{ color: "#ef4444" }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase truncate" style={{ color: "var(--text3)" }}>Descontos</div>
              <div className="font-head text-xs sm:text-sm font-black truncate" style={{ color: "#ef4444" }}>{formatCurrency(totais.descontosMotorista ?? 0)}</div>
            </div>
          </Card>
          <Card className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border border-rose-200 col-span-2 sm:col-span-1">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(244,63,94,.1)", border: "1px solid rgba(244,63,94,.25)" }}>
              <Clock size={16} style={{ color: "#f43f5e" }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase font-bold text-rose-500">Saldo Pendente</div>
              <div className="font-head text-sm sm:text-lg font-black text-rose-600">{formatCurrency(totais.saldoMotorista ?? 0)}</div>
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

        {/* Table */}
        <Card className="p-0 overflow-hidden shadow">
          {loading ? <Loading /> : entregas.length === 0 ? <Empty icon="" text="Nenhum acerto de viagem pendente." /> : (
            <>
            {/* Mobile card list */}
            <div className="block lg:hidden divide-y" style={{ borderColor: "var(--border)" }}>
              {entregas.map((e) => (
                <div key={e.id} className={`p-3 active:bg-slate-50 ${e.isDiariaExtra ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase flex-shrink-0 ${e.isRota ? "bg-orange-100 text-orange-700 border border-orange-200" : "bg-blue-100 text-blue-700 border border-blue-200"}`}>
                        {e.isRota ? "Rota" : "Direta"}
                      </span>
                      <span className="font-mono text-xs font-bold text-gray-700 truncate">{getIdentificador(e)}</span>
                      {e.isDiariaPrincipal && e.diariaQtdViagens > 1 && (
                        <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          DIARIA {e.diariaQtdSaidas} {e.diariaQtdSaidas === 1 ? "saida" : "saidas"}{e.diariaQtdDiretas > 0 && e.diariaQtdRotas > 0 ? ` + ${e.diariaQtdDiretas} dir.` : ""}
                        </span>
                      )}
                      {e.isDiariaExtra && (
                        <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                          Incluso na diaria
                        </span>
                      )}
                    </div>
                    <StatusBadge status={e.statusCanhoto || "PENDENTE"} />
                  </div>
                  <div className="font-bold text-sm text-gray-800 uppercase truncate">{e.motorista?.nome || "Motorista nao vinculado"}</div>
                  <div className="text-[10px] text-gray-400 font-mono truncate">Para: {e.cidade} - {formatDate(e.dataEntrega || e.dataAgendada) || "-"}</div>
                  <div className="grid grid-cols-2 gap-1.5 mt-2 text-[11px]">
                    <div><span className="text-gray-400">Combinado: </span><span className="font-mono font-bold text-orange-500">{formatCurrency(e.valorMotorista)}</span></div>
                    <div><span className="text-gray-400">Vales: </span><span className="font-mono text-gray-600">{formatCurrency(e.valorSaida)}</span></div>
                    <div><span className="text-gray-400">Adiant.: </span><span className="font-mono text-blue-500 font-bold">{formatCurrency(e.adiantamentoMotorista)}</span></div>
                    <div><span className="text-gray-400">Desc.: </span><span className="font-mono text-red-500 font-bold">{formatCurrency(e.descontosMotorista)}</span></div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <div>
                      <div className="text-[9px] uppercase font-bold text-rose-500">Saldo</div>
                      <div className={`font-mono text-sm font-black ${e.saldoMotorista > 0 ? "text-rose-600" : "text-emerald-500"}`}>
                        {formatCurrency(e.saldoMotorista)}
                      </div>
                    </div>
                    <button onClick={() => openEdit(e)}
                      className="px-3 py-2 rounded-lg text-xs font-bold transition-all bg-gray-800 text-white hover:bg-gray-700">
                      Acerto
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block">
            <Table>
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <Th>NF / Rota</Th><Th>Motorista</Th>
                  <Th>Data Frete</Th>
                  <Th>Canhoto</Th>
                  <Th className="text-right">Frete Combinado</Th>
                  <Th className="text-right">Vales / Saída</Th>
                  <Th className="text-right">Descarga</Th>
                  <Th className="text-right">Adiantamento</Th>
                  <Th className="text-right">Desconto</Th>
                  <Th className="text-right bg-rose-50 text-rose-700">Saldo a Pagar</Th>
                  <Th>Data Pgto</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {entregas.map((e) => (
                  <Tr key={e.id} className={`hover:bg-slate-50 ${e.isDiariaExtra ? "opacity-50" : ""}`}>
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
                    <Td>
                      <div className="font-bold text-sm text-gray-800 uppercase">{e.motorista?.nome || "Motorista não vinculado"}</div>
                      <div className="text-[10px] text-gray-400 font-mono">
                        {e.isDiariaPrincipal && e.diariaQtdViagens > 1
                          ? <span className="text-emerald-600 font-bold">Diaria — {e.diariaQtdSaidas} {e.diariaQtdSaidas === 1 ? "saida" : "saidas"} no dia{e.diariaQtdDiretas > 0 && e.diariaQtdRotas > 0 ? ` + ${e.diariaQtdDiretas} direta(s)` : ""}</span>
                          : `Rota para: ${e.cidade}`
                        }
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold" style={{ color: "var(--text2)" }}>
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
                    <Td className="text-right">
                      <span className={`font-mono text-sm font-bold ${e.isDiariaExtra ? "text-gray-300" : "text-orange-500"}`}>{formatCurrency(e.valorMotorista)}</span>
                    </Td>
                    <Td className="text-right"><span className="font-mono text-xs text-gray-500">{formatCurrency(e.valorSaida)}</span></Td>
                    <Td className="text-right"><span className="font-mono text-xs text-gray-500">{formatCurrency(e.valorDescarga)}</span></Td>
                    <Td className="text-right text-gray-500">
                        <div className="font-mono text-xs text-blue-500 font-bold">{formatCurrency(e.adiantamentoMotorista)}</div>
                        <div className="text-[9px] font-mono">{formatDate(e.dataAdiantamento)}</div>
                    </Td>
                    <Td className="text-right"><span className="font-mono text-xs text-red-500 font-bold">{formatCurrency(e.descontosMotorista)}</span></Td>
                    <Td className="text-right bg-rose-50/30">
                      <span className={`font-mono text-sm font-black ${e.saldoMotorista > 0 ? "text-rose-600" : "text-emerald-500"}`}>
                        {formatCurrency(e.saldoMotorista)}
                      </span>
                    </Td>
                    <Td><span className="font-mono text-[10px] font-bold" style={{ color: "var(--text3)" }}>{formatDate(e.dataPagamentoSaldo) || "-"}</span></Td>
                    <Td>
                      <button onClick={() => openEdit(e)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-gray-800 text-white hover:bg-gray-700">
                        Acerto
                      </button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            </div>
            </>
          )}
        </Card>
      </div>

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
