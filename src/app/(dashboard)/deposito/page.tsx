"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card } from "@/components/ui";
import toast from "react-hot-toast";
import { Plus, Download, RefreshCw, AlertTriangle, Search, X, Calendar, ClipboardList } from "lucide-react";
import { TIPOS_ENTRADA, fmtBRL, LIMITE_CRITICO } from "./deposito-ui";
import { DepositoTabela, type DepositoItemRow } from "./DepositoTabela";
import { CandidatosModal } from "./CandidatosModal";
import { EntradaManualModal } from "./EntradaManualModal";
import { BaixaModal } from "./BaixaModal";

// Espelha GET /api/deposito/resumo — só os campos que esta tela usa.
interface ResumoDeposito {
  emEstoque: number;
  volumesEmEstoque: number;
  valorEmEstoque: number;
  maisAntigoDias: number;
  acima30dias: number;
  candidatosPendentes: number;
  porEmbarcador: { cnpj: string; razao: string; count: number }[];
}

export default function DepositoPage() {
  const router = useRouter();
  const [items, setItems] = useState<DepositoItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [resumo, setResumo] = useState<ResumoDeposito | null>(null);

  // Filtros
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterStatus, setFilterStatus] = useState("EM_ESTOQUE");
  const [filterEmbarcador, setFilterEmbarcador] = useState("");
  const [filterTransportadora, setFilterTransportadora] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [diasMin, setDiasMin] = useState("");
  const [transportadoras, setTransportadoras] = useState<string[]>([]);

  // Modais
  const [showCandidatos, setShowCandidatos] = useState(false);
  const [showEntrada, setShowEntrada] = useState(false);
  const [baixaItem, setBaixaItem] = useState<DepositoItemRow | null>(null);

  // Debounce da busca — mesmo idioma de paletes/page.tsx.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      params.set("status", filterStatus);
      if (filterTipo) params.set("tipoEntrada", filterTipo);
      if (filterEmbarcador) params.set("embarcadorCnpj", filterEmbarcador);
      if (filterTransportadora) params.set("transportadora", filterTransportadora);
      if (dataInicio) params.set("dataInicio", dataInicio);
      if (dataFim) params.set("dataFim", dataFim);
      if (diasMin) params.set("diasMin", diasMin);
      params.set("page", String(page));
      const res = await fetch(`/api/deposito?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Erro ao carregar depósito");
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar depósito");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterStatus, filterTipo, filterEmbarcador, filterTransportadora, dataInicio, dataFim, diasMin, page]);

  const carregarResumo = useCallback(async () => {
    try {
      const res = await fetch("/api/deposito/resumo", { cache: "no-store" });
      if (!res.ok) throw new Error("Erro ao carregar resumo");
      setResumo(await res.json());
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar resumo do depósito");
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarResumo(); }, [carregarResumo]);

  // Sugestões de transportadora para o datalist do filtro — busca uma vez.
  useEffect(() => {
    fetch("/api/deposito/transportadoras")
      .then((r) => r.json())
      .then((data) => setTransportadoras(data.transportadoras || []))
      .catch(() => {});
  }, []);

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setFilterTipo("");
    setFilterStatus("EM_ESTOQUE");
    setFilterEmbarcador("");
    setFilterTransportadora("");
    setDataInicio("");
    setDataFim("");
    setDiasMin("");
    setPage(1);
  }

  const hasAnyFilter =
    debouncedSearch || filterTipo || filterStatus !== "EM_ESTOQUE" || filterEmbarcador || filterTransportadora || dataInicio || dataFim || diasMin;

  const candidatosPendentes = resumo?.candidatosPendentes ?? 0;

  return (
    <div className="flex flex-col h-full">
      <Topbar
        title="Depósito"
        subtitle="Mercadoria parada no CD"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowCandidatos(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95"
              style={{
                background: candidatosPendentes > 0 ? "rgba(249,115,22,.12)" : "var(--surface2)",
                color: candidatosPendentes > 0 ? "#f97316" : "var(--text2)",
                border: `1px solid ${candidatosPendentes > 0 ? "rgba(249,115,22,.35)" : "var(--border)"}`,
              }}
            >
              <ClipboardList size={14} /> Candidatos • {candidatosPendentes}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open("/api/deposito/export?preset=lup", "_blank")}
              title="Planilha da LUP: devolução + sobra em estoque"
            >
              <Download size={14} /> Exportar
            </Button>
            <Button size="sm" onClick={() => setShowEntrada(true)}>
              <Plus size={14} /> Entrada manual
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text3)" }}>Itens parados</div>
            <div className="text-2xl font-bold mt-1">{resumo?.emEstoque ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text3)" }}>Volumes</div>
            <div className="text-2xl font-bold mt-1">{resumo?.volumesEmEstoque ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text3)" }}>Valor parado</div>
            <div className="text-2xl font-bold mt-1">{fmtBRL(resumo?.valorEmEstoque ?? 0)}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text3)" }}>Mais antigo</div>
            <div className={`text-2xl font-bold mt-1 ${(resumo?.maisAntigoDias ?? 0) >= LIMITE_CRITICO ? "text-red-600" : ""}`}>
              {resumo?.maisAntigoDias ?? 0} dias
            </div>
          </Card>
        </div>

        {/* Alerta de aging */}
        {resumo && resumo.acima30dias > 0 && (
          <Card
            className="p-3 sm:p-4 flex items-center gap-3 cursor-pointer"
            style={{ background: "rgba(249,115,22,.10)", border: "1px solid rgba(249,115,22,.3)" }}
            onClick={() => { setDiasMin(String(LIMITE_CRITICO)); setPage(1); }}
          >
            <AlertTriangle size={18} style={{ color: "#f97316" }} />
            <span className="text-sm font-semibold" style={{ color: "#c2410c" }}>
              {resumo.acima30dias} itens parados há mais de {LIMITE_CRITICO} dias
            </span>
          </Card>
        )}

        {/* Filtros */}
        <Card className="p-3 sm:p-4">
          <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
            <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar código, NF, descrição, embarcador, localização..."
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <select
              value={filterTipo}
              onChange={(e) => { setFilterTipo(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-lg text-xs outline-none cursor-pointer"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="">Todos os tipos</option>
              {TIPOS_ENTRADA.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-lg text-xs outline-none cursor-pointer"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="EM_ESTOQUE">Em estoque</option>
              <option value="BAIXADO">Baixado</option>
              <option value="TODOS">Todos</option>
            </select>
            <select
              value={filterEmbarcador}
              onChange={(e) => { setFilterEmbarcador(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-lg text-xs outline-none cursor-pointer"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="">Todos os embarcadores</option>
              {(resumo?.porEmbarcador || []).map((e) => (
                <option key={e.cnpj} value={e.cnpj}>{e.razao}</option>
              ))}
            </select>
            <input
              value={filterTransportadora}
              onChange={(e) => { setFilterTransportadora(e.target.value); setPage(1); }}
              list="dl-transp-filtro"
              placeholder="Transportadora"
              title="Busca por parte do nome — 'porto' encontra todas as grafias."
              className="px-3 py-2 rounded-lg text-xs outline-none w-full sm:w-auto sm:min-w-[160px]"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <datalist id="dl-transp-filtro">
              {transportadoras.map((t) => <option key={t} value={t} />)}
            </datalist>
            <Button variant="ghost" size="sm" onClick={carregar}>
              <RefreshCw size={13} /> Atualizar
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text3)" }}>
              <Calendar size={11} /> Período (data de entrada)
            </div>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => { setDataInicio(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <span className="text-xs" style={{ color: "var(--text3)" }}>até</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => { setDataFim(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            {hasAnyFilter && (
              <button
                onClick={clearFilters}
                className="text-[11px] font-medium px-2 py-1 rounded-lg transition-all hover:bg-red-50"
                style={{ color: "#ef4444" }}
              >
                <X size={11} className="inline -mt-px mr-0.5" /> Limpar filtros
              </button>
            )}
          </div>
          <p className="text-[10px] mt-2" style={{ color: "var(--text3)" }}>
            Dias parado é o relógio do depósito — não é o cálculo de armazenagem.
          </p>
        </Card>

        <DepositoTabela
          items={items}
          loading={loading}
          onBaixa={(item) => setBaixaItem(item)}
          onDetalhe={(item) => router.push(`/deposito/${item.id}`)}
        />

        {pages > 1 && (
          <div className="flex items-center justify-between text-xs" style={{ color: "var(--text3)" }}>
            <span>Página {page} de {pages} · {total} itens</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </div>

      <CandidatosModal
        open={showCandidatos}
        onClose={() => setShowCandidatos(false)}
        onImportado={() => { carregar(); carregarResumo(); }}
      />
      <EntradaManualModal
        open={showEntrada}
        onClose={() => setShowEntrada(false)}
        onSalvo={() => { carregar(); carregarResumo(); }}
      />
      <BaixaModal
        item={baixaItem}
        onClose={() => setBaixaItem(null)}
        onBaixado={() => { carregar(); carregarResumo(); }}
      />
    </div>
  );
}
