"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import {
  Button, Card, Loading, Empty, StatusBadge, Modal,
  Table, Th, Td, Tr,
} from "@/components/ui";
import { formatCurrency, formatDate, formatWeight, formatCNPJ } from "@/lib/utils";
import { Calendar, Search, Eye, RefreshCw, ChevronLeft, ChevronRight, Clock, List, LayoutGrid, CalendarDays } from "lucide-react";

type FiltroData = "TODAS" | "HOJE" | "AMANHA" | "SEMANA" | "MES";
type ViewMode = "lista" | "calendario";

export default function AgendamentosPage() {
  const router = useRouter();
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filtroData, setFiltroData] = useState<FiltroData>("TODAS");
  const [viewMode, setViewMode] = useState<ViewMode>("lista");

  // Calendar state
  const [calMes, setCalMes] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calEntregas, setCalEntregas] = useState<any[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);

  // Day detail modal
  const [selectedDay, setSelectedDay] = useState<{ day: number; entregas: any[] } | null>(null);

  // Bulk scheduling states
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkItems, setBulkItems] = useState<any[]>([]); // parsed and validated items
  const [validatingBulk, setValidatingBulk] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch list view
  const fetchEntregas = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "50",
      apenasAgendadas: "true",
      sortBy: "dataAgendada",
      sortOrder: "asc",
    });

    if (debouncedSearch) params.set("cliente", debouncedSearch);

    const hoje = new Date();
    const y = hoje.getFullYear(), m = hoje.getMonth(), d = hoje.getDate();
    if (filtroData === "HOJE") {
      params.set("dataInicio", new Date(Date.UTC(y, m, d)).toISOString());
      params.set("dataFim", new Date(Date.UTC(y, m, d, 23, 59, 59, 999)).toISOString());
    } else if (filtroData === "AMANHA") {
      const amanha = new Date(hoje);
      amanha.setDate(d + 1);
      params.set("dataInicio", new Date(Date.UTC(amanha.getFullYear(), amanha.getMonth(), amanha.getDate())).toISOString());
      params.set("dataFim", new Date(Date.UTC(amanha.getFullYear(), amanha.getMonth(), amanha.getDate(), 23, 59, 59, 999)).toISOString());
    } else if (filtroData === "SEMANA") {
      const seg = new Date(hoje);
      seg.setDate(d - ((hoje.getDay() + 6) % 7));
      const dom = new Date(seg);
      dom.setDate(seg.getDate() + 6);
      params.set("dataInicio", new Date(Date.UTC(seg.getFullYear(), seg.getMonth(), seg.getDate())).toISOString());
      params.set("dataFim", new Date(Date.UTC(dom.getFullYear(), dom.getMonth(), dom.getDate(), 23, 59, 59, 999)).toISOString());
    } else if (filtroData === "MES") {
      const ultimoDia = new Date(y, m + 1, 0).getDate();
      params.set("dataInicio", new Date(Date.UTC(y, m, 1)).toISOString());
      params.set("dataFim", new Date(Date.UTC(y, m, ultimoDia, 23, 59, 59, 999)).toISOString());
    }

    try {
      const res = await fetch(`/api/entregas?${params}`);
      const data = await res.json();
      setEntregas(data.entregas || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {
      toast.error("Erro ao puxar agendamentos");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filtroData]);

  // Fetch calendar view (full month, no pagination)
  const fetchCalendar = useCallback(async () => {
    setLoadingCal(true);
    const { year, month } = calMes;
    const ultimoDia = new Date(year, month + 1, 0).getDate();
    const params = new URLSearchParams({
      page: "1",
      limit: "500",
      apenasAgendadas: "true",
      sortBy: "dataAgendada",
      sortOrder: "asc",
      dataInicio: new Date(Date.UTC(year, month, 1)).toISOString(),
      dataFim: new Date(Date.UTC(year, month, ultimoDia, 23, 59, 59, 999)).toISOString(),
    });
    if (debouncedSearch) params.set("cliente", debouncedSearch);
    try {
      const res = await fetch(`/api/entregas?${params}`);
      const data = await res.json();
      setCalEntregas(data.entregas || []);
    } catch {
      toast.error("Erro ao carregar calendário");
    } finally {
      setLoadingCal(false);
    }
  }, [calMes, debouncedSearch]);

  useEffect(() => { if (viewMode === "lista") fetchEntregas(); }, [fetchEntregas, viewMode]);
  useEffect(() => { if (viewMode === "calendario") fetchCalendar(); }, [fetchCalendar, viewMode]);

  const handleProcessBulkText = async () => {
    if (!bulkText.trim()) {
      toast.error("Cole o conteúdo da planilha primeiro");
      return;
    }

    setValidatingBulk(true);
    setHasProcessed(false);
    try {
      const lines = bulkText.split(/\r?\n/);
      const parsedItems: { notaFiscal: string; dataAgendada: string }[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        // Separar por Tab ou ponto e vírgula ou vírgula
        const cols = line.split(/\t|;|\|/);
        if (cols.length < 2) continue;

        const nfRaw = cols[0].trim();
        const dataRaw = cols[1].trim();

        // Ignorar linhas de cabeçalho
        if (
          nfRaw.toLowerCase().includes("nota") || 
          nfRaw.toLowerCase().includes("nf") ||
          dataRaw.toLowerCase().includes("agenda") ||
          dataRaw.toLowerCase().includes("data")
        ) {
          continue;
        }

        // Tentar formatar a data de DD/MM/YYYY para YYYY-MM-DD
        let formattedDate = "";
        const dateParts = dataRaw.split("/");
        if (dateParts.length === 3) {
          const day = dateParts[0].trim().padStart(2, "0");
          const month = dateParts[1].trim().padStart(2, "0");
          const year = dateParts[2].trim();
          formattedDate = `${year}-${month}-${day}`;
        } else {
          // Tentar ler como YYYY-MM-DD
          const parsed = new Date(dataRaw);
          if (!isNaN(parsed.getTime())) {
            formattedDate = parsed.toISOString().split("T")[0];
          }
        }

        if (nfRaw && formattedDate) {
          parsedItems.push({
            notaFiscal: nfRaw,
            dataAgendada: formattedDate,
          });
        }
      }

      if (parsedItems.length === 0) {
        toast.error("Nenhum registro válido encontrado. Verifique se copiou a coluna de Nota Fiscal e a coluna de Data.");
        setValidatingBulk(false);
        return;
      }

      // Enviar para validação no backend
      const res = await fetch("/api/entregas/agendar-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate",
          items: parsedItems,
        }),
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setBulkItems(data.items || []);
      setHasProcessed(true);
    } catch (err) {
      toast.error("Erro ao validar dados do agendamento");
    } finally {
      setValidatingBulk(false);
    }
  };

  const handleSaveBulk = async () => {
    const validItems = bulkItems.filter(item => item.status === "valido");
    if (validItems.length === 0) {
      toast.error("Nenhum agendamento válido para salvar");
      return;
    }

    setSavingBulk(true);
    try {
      const res = await fetch("/api/entregas/agendar-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          items: validItems.map(item => ({
            notaFiscal: item.notaFiscal,
            dataAgendada: item.dataAgendada,
          })),
        }),
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      toast.success(`${data.updatedCount || validItems.length} entrega(s) agendada(s) com sucesso!`);
      setShowBulkModal(false);
      setBulkText("");
      setBulkItems([]);
      setHasProcessed(false);
      fetchEntregas();
    } catch {
      toast.error("Erro ao confirmar agendamento em lote");
    } finally {
      setSavingBulk(false);
    }
  };

  // Contagem de atrasadas
  const hojeStr = new Date().toISOString().split("T")[0];
  const atrasadas = entregas.filter((e) => {
    if (!e.dataAgendada || ["ENTREGUE", "FINALIZADO", "OCORRENCIA"].includes(e.status)) return false;
    return new Date(e.dataAgendada).toISOString().split("T")[0] < hojeStr;
  }).length;

  // Calendar helpers
  const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  const DIAS_SEMANA_FULL = ["Domingo", "Segunda-Feira", "Terça-Feira", "Quarta-Feira", "Quinta-Feira", "Sexta-Feira", "Sábado"];
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  function buildCalendarDays() {
    const { year, month } = calMes;
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(i);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }

  function getEntregasForDay(day: number) {
    const { year, month } = calMes;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return calEntregas.filter((e) => {
      if (!e.dataAgendada) return false;
      return e.dataAgendada.slice(0, 10) === dateStr;
    });
  }

  function prevMonth() { setCalMes((c) => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }); }
  function nextMonth() { setCalMes((c) => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }); }

  const calDays = buildCalendarDays();
  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

  return (
    <>
      <Topbar
        title="Agendamentos"
        subtitle={`${total} entrega(s) com data marcada`}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setShowBulkModal(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
              <CalendarDays size={14} className="mr-1.5" /> Agendar em Lote (Excel)
            </Button>
            <Button onClick={() => router.push("/entregas")} variant="ghost">
              Ir para Entregas gerais
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* Aviso de Atrasadas */}
        {viewMode === "lista" && atrasadas > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold animate-pulse"
            style={{ background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)", color: "#ef4444" }}>
            <Clock size={16} /> Temos {atrasadas} agendamento(s) com a data VENCIDA nesta lista!
          </div>
        )}

        {/* Filters Box */}
        <Card className="p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex flex-wrap gap-2 items-center">
            {/* View mode toggle */}
            <div className="flex rounded-lg overflow-hidden mr-2" style={{ border: "1px solid var(--border)" }}>
              <button onClick={() => setViewMode("lista")}
                className={`px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors ${viewMode === "lista" ? "bg-orange-500/10 text-orange-500" : "text-[var(--text2)] hover:bg-[var(--surface2)]"}`}>
                <List size={13} /> Lista
              </button>
              <button onClick={() => setViewMode("calendario")}
                className={`px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors ${viewMode === "calendario" ? "bg-orange-500/10 text-orange-500" : "text-[var(--text2)] hover:bg-[var(--surface2)]"}`}
                style={{ borderLeft: "1px solid var(--border)" }}>
                <LayoutGrid size={13} /> Calendário
              </button>
            </div>

            {viewMode === "lista" && (["TODAS", "HOJE", "AMANHA", "SEMANA", "MES"] as FiltroData[]).map((f) => (
              <button
                key={f}
                onClick={() => { setFiltroData(f); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  filtroData === f
                    ? "border-orange-500/50 bg-orange-500/10 text-orange-500"
                    : "border-transparent text-[var(--text2)] hover:bg-[var(--surface2)]"
                }`}
              >
                {f === "TODAS" && "Todos"}
                {f === "HOJE" && "Hoje"}
                {f === "AMANHA" && "Amanhã"}
                {f === "SEMANA" && "Esta Semana"}
                {f === "MES" && "Este Mês"}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="relative w-[250px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)]"
              />
            </div>
            <Button variant="ghost" onClick={viewMode === "lista" ? fetchEntregas : fetchCalendar}>
              <RefreshCw size={14} />
            </Button>
          </div>
        </Card>

        {/* LIST VIEW */}
        {viewMode === "lista" && (
          <Card className="p-0 overflow-hidden">
            {loading ? <Loading /> : entregas.length === 0 ? <Empty icon="📆" text="Nenhum agendamento para este período" /> : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Data Agendada</Th>
                      <Th>Status</Th>
                      <Th>Fornecedor</Th>
                      <Th>NF / Cliente</Th>
                      <Th>Cidade / UF</Th>
                      <Th>Peso</Th>
                      <Th>Paletes</Th>
                      <Th>Motorista</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {entregas.map((e) => {
                      const dataStr = e.dataAgendada ? new Date(e.dataAgendada).toISOString().split("T")[0] : null;
                      const atrasada = dataStr && dataStr < hojeStr && !["ENTREGUE", "FINALIZADO", "OCORRENCIA"].includes(e.status);
                      const fornecedor = e.notas && e.notas.length > 0 
                        ? Array.from(new Set(e.notas.filter((n: any) => n.emitenteRazao).map((n: any) => n.emitenteRazao))).join(", ") || "—"
                        : "—";
                      return (
                        <Tr key={e.id} onClick={() => router.push(`/entregas/${e.id}`)}
                          className={atrasada ? "border-l-4" : ""}
                          style={atrasada ? { borderLeftColor: "#ef4444", background: "rgba(239,68,68,0.03)" } as any : {}}>
                          <Td>
                            <div className={`font-semibold text-sm ${atrasada ? "text-red-400" : "text-[var(--text)]"}`}>
                              {formatDate(e.dataAgendada)}
                            </div>
                            {atrasada && <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Atrasado</span>}
                          </Td>
                          <Td><StatusBadge status={e.status} /></Td>
                          <Td>
                            <span className="text-xs text-[var(--text2)] truncate max-w-[150px] inline-block" title={fornecedor}>{fornecedor}</span>
                          </Td>
                          <Td>
                            <div className="font-semibold text-sm leading-tight text-[var(--text)] mb-0.5">{e.razaoSocial}</div>
                            <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                              {e.notas && e.notas.length > 0 ? e.notas.map((n: any) => n.numero).join(", ") : e.codigo} • {formatCNPJ(e.cnpj)}
                            </div>
                          </Td>
                          <Td><span className="text-xs text-[var(--text2)]">{e.cidade}{e.uf ? ` — ${e.uf}` : ""}</span></Td>
                          <Td><span className="text-xs font-mono text-[var(--text2)]">{formatWeight(e.pesoTotal)}</span></Td>
                          <Td>
                            <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>
                              {e.quantidadePaletes || 0}
                            </span>
                          </Td>
                          <Td><span className="text-xs text-[var(--text2)]">{e.motorista?.nome || <span style={{ color: "var(--text3)" }}>Não alocado</span>}</span></Td>
                          <Td className="text-right">
                            <button className="p-1.5 rounded-lg hover:opacity-70 transition-all bg-[var(--surface2)] text-[var(--text2)]"
                              onClick={(ev) => { ev.stopPropagation(); router.push(`/entregas/${e.id}`); }}>
                              <Eye size={13} />
                            </button>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>

                {pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <span className="text-xs font-mono text-[var(--text3)]">
                      Página {page} de {pages} · {total} agendamentos
                    </span>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                        <ChevronLeft size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>
                        <ChevronRight size={14} />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {/* CALENDAR VIEW */}
        {viewMode === "calendario" && (
          <Card className="p-0 overflow-hidden">
            {/* Month navigation */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-[var(--surface2)] transition-colors">
                <ChevronLeft size={18} style={{ color: "var(--text2)" }} />
              </button>
              <h2 className="text-lg font-head font-bold">{MESES[calMes.month]} {calMes.year}</h2>
              <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-[var(--surface2)] transition-colors">
                <ChevronRight size={18} style={{ color: "var(--text2)" }} />
              </button>
            </div>

            {loadingCal ? <Loading /> : (
              <div className="overflow-x-auto">
                {/* Day headers */}
                <div className="grid grid-cols-7 text-center" style={{ borderBottom: "1px solid var(--border)" }}>
                  {DIAS_SEMANA.map((d) => (
                    <div key={d} className="py-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text3)" }}>{d}</div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7">
                  {calDays.map((day, i) => {
                    if (day === null) return <div key={`empty-${i}`} className="min-h-[120px]" style={{ borderRight: i % 7 !== 6 ? "1px solid var(--border)" : "none", borderBottom: "1px solid var(--border)", background: "var(--surface)" }} />;

                    const dayEntregas = getEntregasForDay(day);
                    const dateStr = `${calMes.year}-${String(calMes.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const isToday = dateStr === todayStr;
                    const MAX_SHOW = 3;

                    return (
                      <div key={day} className="min-h-[120px] p-1.5 flex flex-col"
                        style={{
                          borderRight: i % 7 !== 6 ? "1px solid var(--border)" : "none",
                          borderBottom: "1px solid var(--border)",
                          background: isToday ? "rgba(249,115,22,.04)" : "transparent",
                        }}>
                        <div className={`text-xs font-mono mb-1 px-1 ${isToday ? "font-bold text-orange-500" : ""}`} style={{ color: isToday ? undefined : "var(--text2)" }}>
                          {day}
                        </div>
                        <div className="flex-1 space-y-0.5 overflow-hidden">
                          {dayEntregas.slice(0, MAX_SHOW).map((e) => {
                            const fornecedor = e.notas && e.notas.length > 0 
                              ? Array.from(new Set(e.notas.filter((n: any) => n.emitenteRazao).map((n: any) => n.emitenteRazao))).join(", ") || "—"
                              : "—";
                            const titleStr = `${e.razaoSocial}\nFornecedor: ${fornecedor}\nPeso: ${formatWeight(e.pesoTotal)}\nPaletes: ${e.quantidadePaletes || 0}`;
                            return (
                              <div key={e.id}
                                onClick={(ev) => { ev.stopPropagation(); router.push(`/entregas/${e.id}`); }}
                                className="px-1.5 py-1 rounded text-[10px] font-medium leading-tight truncate cursor-pointer hover:opacity-80 transition-opacity"
                                style={{
                                  background: ["ENTREGUE", "FINALIZADO"].includes(e.status) ? "rgba(16,185,129,.1)" : e.status === "OCORRENCIA" ? "rgba(245,158,11,.1)" : dateStr < hojeStr ? "rgba(239,68,68,.08)" : "rgba(59,130,246,.08)",
                                  color: ["ENTREGUE", "FINALIZADO"].includes(e.status) ? "#10b981" : e.status === "OCORRENCIA" ? "#d97706" : dateStr < hojeStr ? "#ef4444" : "#3b82f6",
                                  border: `1px solid ${["ENTREGUE", "FINALIZADO"].includes(e.status) ? "rgba(16,185,129,.2)" : e.status === "OCORRENCIA" ? "rgba(245,158,11,.2)" : dateStr < hojeStr ? "rgba(239,68,68,.15)" : "rgba(59,130,246,.15)"}`,
                                }}
                                title={titleStr}
                              >
                                {e.razaoSocial}
                              </div>
                            );
                          })}
                          {dayEntregas.length > MAX_SHOW && (
                            <button
                              onClick={(ev) => { ev.stopPropagation(); setSelectedDay({ day, entregas: dayEntregas }); }}
                              className="text-[10px] font-medium px-1 hover:underline cursor-pointer"
                              style={{ color: "var(--accent)" }}>
                              +{dayEntregas.length - MAX_SHOW} mais
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Day Detail Modal */}
      <Modal open={!!selectedDay} onClose={() => setSelectedDay(null)}
        title={selectedDay ? (() => {
          const d = new Date(calMes.year, calMes.month, selectedDay.day);
          return `${DIAS_SEMANA_FULL[d.getDay()]}, ${selectedDay.day} de ${MESES[calMes.month]}`;
        })() : ""}
        size="md">
        {selectedDay && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--accent)" }}>Entregas do Dia</span>
              <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(59,130,246,.1)", color: "#3b82f6" }}>
                {selectedDay.entregas.length} entrega(s)
              </span>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {selectedDay.entregas.map((e) => {
                const fornecedor = e.notas && e.notas.length > 0 
                  ? Array.from(new Set(e.notas.filter((n: any) => n.emitenteRazao).map((n: any) => n.emitenteRazao))).join(", ") || "—"
                  : "—";
                return (
                  <div key={e.id}
                    onClick={() => { setSelectedDay(null); router.push(`/entregas/${e.id}`); }}
                    className="p-3 rounded-xl cursor-pointer hover:shadow-md transition-all"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-sm font-semibold leading-tight flex-1 mr-2">{e.razaoSocial}</span>
                      <StatusBadge status={e.status} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text3)" }}>
                      {e.motorista?.nome && (
                        <span className="flex items-center gap-1">
                          <span>👤</span> {e.motorista.nome}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <span>📍</span> {e.cidade}{e.uf ? `, ${e.uf}` : ""}
                      </span>
                      {e.notas && e.notas.length > 0 && (
                        <span className="font-mono">NF {e.notas.map((n: any) => n.numero).join(", ")}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] mt-1.5 pt-1.5 border-t border-[var(--border)]" style={{ color: "var(--text2)" }}>
                      <span className="flex items-center gap-1">
                        <span className="font-semibold text-[var(--text3)]">Fornecedor:</span> {fornecedor}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-semibold text-[var(--text3)]">Peso:</span> {formatWeight(e.pesoTotal)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-semibold text-[var(--text3)]">Paletes:</span> {e.quantidadePaletes || 0}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Agendamento em Lote */}
      <Modal open={showBulkModal} onClose={() => { setShowBulkModal(false); setBulkText(""); setBulkItems([]); setHasProcessed(false); }} title="Agendar Entregas em Lote (Excel)" size="lg">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Copie as colunas <strong>Nota Fiscal</strong> e <strong>Data do Agendamento</strong> da sua planilha do Excel e cole na caixa abaixo.
          </p>

          {!hasProcessed ? (
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Dados da Planilha (Nota Fiscal [Tab] Data)</label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Exemplo:&#10;104452&#9;16/06/2026&#10;105843&#9;17/06/2026"
                className="w-full h-64 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface2)] text-sm font-mono outline-none focus:border-orange-500/50"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-gray-600">Pré-visualização dos Registros</span>
                <button onClick={() => setHasProcessed(false)} className="text-orange-500 hover:underline">Voltar a colar texto</button>
              </div>

              <div className="max-h-80 overflow-y-auto border border-[var(--border)] rounded-xl">
                <Table>
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr>
                      <Th>Nota Fiscal</Th>
                      <Th>Data Agendamento</Th>
                      <Th>Cliente</Th>
                      <Th>Cidade</Th>
                      <Th>Status no Sistema</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkItems.map((item, idx) => (
                      <Tr key={idx} className={item.status === "valido" ? "hover:bg-slate-50" : "bg-red-50/20"}>
                        <Td className="font-mono font-bold text-xs">{item.notaFiscal}</Td>
                        <Td className="font-mono text-xs">{formatDate(item.dataAgendada)}</Td>
                        <Td className="text-xs max-w-[150px] truncate">{item.razaoSocial || "—"}</Td>
                        <Td className="text-xs">{item.cidade || "—"}</Td>
                        <Td>
                          {item.status === "valido" ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                              ✓ Pronto
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700" title={item.motivo}>
                              ✗ {item.motivo}
                            </span>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-orange-500/5 text-sm font-semibold border border-orange-500/10">
                <span className="text-gray-600">
                  Total processado: {bulkItems.length} registro(s)
                </span>
                <span className="text-emerald-600">
                  Prontos para agendar: {bulkItems.filter(i => i.status === "valido").length}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <Button variant="ghost" onClick={() => { setShowBulkModal(false); setBulkText(""); setBulkItems([]); setHasProcessed(false); }}>
              Cancelar
            </Button>
            {!hasProcessed ? (
              <Button onClick={handleProcessBulkText} disabled={validatingBulk || !bulkText.trim()} className="bg-orange-500 hover:bg-orange-600 text-white border-none">
                {validatingBulk ? "Processando..." : "Processar Dados"}
              </Button>
            ) : (
              <Button onClick={handleSaveBulk} disabled={savingBulk || bulkItems.filter(i => i.status === "valido").length === 0} className="bg-orange-500 hover:bg-orange-600 text-white border-none">
                {savingBulk ? "Agendando..." : "Confirmar Agendamento"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
