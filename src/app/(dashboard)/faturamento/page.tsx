"use client";
import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, Empty, Modal, Input, Table, Th, Td, Tr } from "@/components/ui";
import { formatCurrency, formatDate, formatCNPJ } from "@/lib/utils";
import { RefreshCw, FilePlus, CheckCircle2, Eye, ChevronDown, ChevronUp, Search, Warehouse, Truck, Receipt, Trash2, DollarSign, Edit2, AlertTriangle } from "lucide-react";

type TabKey = "fretes" | "armazenagem" | "faturas" | "diarias" | "transportadoras";

export default function FaturamentoPage() {
  const [tab, setTab] = useState<TabKey>("fretes");

  const [ctesAgrupados, setCtesAgrupados] = useState<any[]>([]);
  const [armazenagemPendente, setArmazenagemPendente] = useState<any[]>([]);
  const [faturas, setFaturas] = useState<any[]>([]);
  const [faturasArm, setFaturasArm] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Seleção de CTes
  const [selectedCteIds, setSelectedCteIds] = useState<string[]>([]);
  const [faturandoClient, setFaturandoClient] = useState<any>(null);
  const [showGerarModal, setShowGerarModal] = useState(false);
  const [dataVencimento, setDataVencimento] = useState("");
  const [gerando, setGerando] = useState(false);

  // Seleção de armazenagem
  const [selectedArmIds, setSelectedArmIds] = useState<string[]>([]);
  const [armFornecedor, setArmFornecedor] = useState<any>(null);
  const [showGerarArmModal, setShowGerarArmModal] = useState(false);
  const [dataVencArm, setDataVencArm] = useState("");
  const [gerandoArm, setGerandoArm] = useState(false);

  // Modal detalhe
  const [faturaDetalhe, setFaturaDetalhe] = useState<any>(null);
  const [faturaArmDetalhe, setFaturaArmDetalhe] = useState<any>(null);

  // Diárias
  const [diarias, setDiarias] = useState<any[]>([]);
  const [diariaEdit, setDiariaEdit] = useState<any>(null);
  const [diariaEditForm, setDiariaEditForm] = useState({ valor: "", motivo: "", observacoes: "" });
  const [diariaPagar, setDiariaPagar] = useState<any>(null);
  const [diariaPagarForm, setDiariaPagarForm] = useState({ dataPagamento: "", formaPagamento: "PIX" });
  const [savingDiaria, setSavingDiaria] = useState(false);
  const [showDiariaHist, setShowDiariaHist] = useState(false);

  // Expandir grupos
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [expandedArmazens, setExpandedArmazens] = useState<string[]>([]);

  // Pesquisa
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.toLowerCase().trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resCtes, resFaturas, resArm, resFatArm, resDiarias] = await Promise.all([
        fetch("/api/financeiro/ctes-pendentes").then((r) => r.json()),
        fetch("/api/financeiro/faturas").then((r) => r.json()),
        fetch("/api/financeiro/armazenagem-pendente").then((r) => r.json()),
        fetch("/api/financeiro/faturas-armazenagem").then((r) => r.json()),
        fetch("/api/diarias?limit=500").then((r) => r.json()),
      ]);
      setCtesAgrupados(Array.isArray(resCtes) ? resCtes : []);
      setFaturas(Array.isArray(resFaturas) ? resFaturas : []);
      setArmazenagemPendente(Array.isArray(resArm) ? resArm : []);
      setFaturasArm(Array.isArray(resFatArm) ? resFatArm : []);
      setDiarias(resDiarias?.itens || []);
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleGroup(cnpj: string) {
    setExpandedGroups((prev) => prev.includes(cnpj) ? prev.filter((c) => c !== cnpj) : [...prev, cnpj]);
  }

  function toggleCte(cteId: string, grupo: any) {
    if (faturandoClient && faturandoClient.tomadorCnpj !== grupo.tomadorCnpj) {
      toast.error("Selecione CT-es do mesmo tomador");
      return;
    }
    setSelectedCteIds((prev) => {
      const next = prev.includes(cteId) ? prev.filter((id) => id !== cteId) : [...prev, cteId];
      if (next.length === 0) setFaturandoClient(null);
      else setFaturandoClient(grupo);
      return next;
    });
  }

  function selectAllFromGroup(grupo: any) {
    if (faturandoClient && faturandoClient.tomadorCnpj !== grupo.tomadorCnpj) {
      toast.error("Selecione CT-es do mesmo tomador");
      return;
    }
    setSelectedCteIds(grupo.ctes.map((c: any) => c.id));
    setFaturandoClient(grupo);
  }

  function openGerarModal() {
    if (selectedCteIds.length === 0) return;
    const d = new Date(); d.setDate(d.getDate() + 30);
    setDataVencimento(d.toISOString().slice(0, 10));
    setShowGerarModal(true);
  }

  async function handleGerarFatura() {
    if (!faturandoClient || selectedCteIds.length === 0) return;
    setGerando(true);
    try {
      const res = await fetch("/api/financeiro/faturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: faturandoClient.tomadorCnpj,
          nomeCliente: faturandoClient.tomadorNome,
          cteIds: selectedCteIds,
          dataVencimento: dataVencimento || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Fatura gerada com sucesso!");
      setSelectedCteIds([]); setFaturandoClient(null); setShowGerarModal(false);
      fetchData();
    } catch {
      toast.error("Erro ao gerar fatura");
    } finally { setGerando(false); }
  }

  async function handleDarBaixa(faturaId: string) {
    try {
      const res = await fetch("/api/financeiro/faturas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: faturaId, status: "PAGA" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Fatura marcada como PAGA");
      fetchData();
    } catch { toast.error("Erro ao dar baixa"); }
  }

  // Armazenagem handlers
  function toggleArmEntrega(entregaId: string, grupo: any) {
    if (armFornecedor && armFornecedor.cnpjCliente !== grupo.cnpjCliente) {
      toast.error("Selecione entregas do mesmo fornecedor");
      return;
    }
    setSelectedArmIds((prev) => {
      const next = prev.includes(entregaId) ? prev.filter((id) => id !== entregaId) : [...prev, entregaId];
      if (next.length === 0) setArmFornecedor(null);
      else setArmFornecedor(grupo);
      return next;
    });
  }

  function selectAllFromArmGroup(grupo: any) {
    if (armFornecedor && armFornecedor.cnpjCliente !== grupo.cnpjCliente) {
      toast.error("Selecione entregas do mesmo fornecedor");
      return;
    }
    setSelectedArmIds(grupo.entregas.map((e: any) => e.id));
    setArmFornecedor(grupo);
  }

  function openGerarArmModal() {
    if (selectedArmIds.length === 0) return;
    const d = new Date(); d.setDate(d.getDate() + 30);
    setDataVencArm(d.toISOString().slice(0, 10));
    setShowGerarArmModal(true);
  }

  async function handleGerarArmFatura() {
    if (!armFornecedor || selectedArmIds.length === 0) return;
    setGerandoArm(true);
    try {
      const res = await fetch("/api/financeiro/faturas-armazenagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorCnpj: armFornecedor.cnpjCliente,
          entregaIds: selectedArmIds,
          dataVencimento: dataVencArm || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro");
      }
      toast.success("Fatura de armazenagem gerada!");
      setSelectedArmIds([]); setArmFornecedor(null); setShowGerarArmModal(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar fatura");
    } finally { setGerandoArm(false); }
  }

  async function handleDarBaixaArm(id: string) {
    try {
      const res = await fetch("/api/financeiro/faturas-armazenagem", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "PAGA" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Fatura marcada como PAGA");
      fetchData();
    } catch { toast.error("Erro ao dar baixa"); }
  }

  async function handleExcluirArm(id: string) {
    if (!confirm("Excluir fatura? Os itens voltarão para a lista de pendentes.")) return;
    try {
      const res = await fetch(`/api/financeiro/faturas-armazenagem?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Fatura excluída");
      setFaturaArmDetalhe(null);
      fetchData();
    } catch { toast.error("Erro ao excluir"); }
  }

  // Filtros
  const filteredCtes = debouncedSearch
    ? ctesAgrupados.map((g) => {
        const matchGroup = g.tomadorNome?.toLowerCase().includes(debouncedSearch) || g.tomadorCnpj?.includes(debouncedSearch);
        const filteredGroupCtes = g.ctes.filter((c: any) =>
          c.numero?.toLowerCase().includes(debouncedSearch) ||
          c.notas?.some((n: any) => n.numero?.toLowerCase().includes(debouncedSearch) || n.destinatarioRazao?.toLowerCase().includes(debouncedSearch))
        );
        if (matchGroup) return g;
        if (filteredGroupCtes.length === 0) return null;
        return { ...g, ctes: filteredGroupCtes, totalValor: filteredGroupCtes.reduce((s: number, c: any) => s + c.valorReceber, 0) };
      }).filter(Boolean) as any[]
    : ctesAgrupados;

  const filteredArm = debouncedSearch
    ? armazenagemPendente.map((g) => {
        const matchGroup = g.nomeCliente?.toLowerCase().includes(debouncedSearch) || g.cnpjCliente?.includes(debouncedSearch);
        const filteredEntregas = g.entregas.filter((e: any) =>
          e.codigo?.toLowerCase().includes(debouncedSearch) ||
          e.destinatarioRazao?.toLowerCase().includes(debouncedSearch) ||
          e.nfs?.some((n: string) => n.toLowerCase().includes(debouncedSearch))
        );
        if (matchGroup) return g;
        if (filteredEntregas.length === 0) return null;
        return { ...g, entregas: filteredEntregas, totalValor: filteredEntregas.reduce((s: number, e: any) => s + e.valorCalculado, 0), totalPaletes: filteredEntregas.reduce((s: number, e: any) => s + e.quantidadePaletes, 0) };
      }).filter(Boolean) as any[]
    : armazenagemPendente;

  const filteredFaturas = debouncedSearch
    ? faturas.filter((f) =>
        f.numero?.toLowerCase().includes(debouncedSearch) ||
        f.clienteNome?.toLowerCase().includes(debouncedSearch) ||
        f.clienteCnpj?.includes(debouncedSearch) ||
        f.ctes?.some((c: any) => c.numero?.toLowerCase().includes(debouncedSearch))
      )
    : faturas;

  const filteredFaturasArm = debouncedSearch
    ? faturasArm.filter((f) =>
        f.numero?.toLowerCase().includes(debouncedSearch) ||
        f.fornecedorNome?.toLowerCase().includes(debouncedSearch) ||
        f.fornecedorCnpj?.includes(debouncedSearch) ||
        f.items?.some((i: any) => i.codigoEntrega?.toLowerCase().includes(debouncedSearch) || i.nfs?.toLowerCase().includes(debouncedSearch))
      )
    : faturasArm;

  // Totais
  const totalPendenteCtes = ctesAgrupados.reduce((s, g) => s + g.totalValor, 0);
  const totalArmPendente = armazenagemPendente.reduce((s: number, g: any) => s + g.totalValor, 0);
  const totalFaturasAbertas = faturas.filter((f) => f.status === "ABERTA").reduce((s, f) => s + f.valorTotal, 0) +
                              faturasArm.filter((f: any) => f.status === "ABERTA").reduce((s: number, f: any) => s + f.valorTotal, 0);
  const totalFaturasPagas = faturas.filter((f) => f.status === "PAGA").reduce((s, f) => s + f.valorTotal, 0) +
                            faturasArm.filter((f: any) => f.status === "PAGA").reduce((s: number, f: any) => s + f.valorTotal, 0);
  const selectedTotal = faturandoClient
    ? faturandoClient.ctes.filter((c: any) => selectedCteIds.includes(c.id)).reduce((s: number, c: any) => s + c.valorReceber, 0)
    : 0;
  const selectedArmTotal = armFornecedor
    ? armFornecedor.entregas.filter((e: any) => selectedArmIds.includes(e.id)).reduce((s: number, e: any) => s + e.valorCalculado, 0)
    : 0;

  // ─── Diárias ─────────────────────────────────────────────────
  function openDiariaEdit(d: any) {
    setDiariaEdit(d);
    setDiariaEditForm({
      valor: d.valor > 0 ? String(d.valor).replace(".", ",") : "",
      motivo: d.motivo || "",
      observacoes: d.observacoes || "",
    });
  }

  async function handleSaveDiariaValor() {
    if (!diariaEdit) return;
    setSavingDiaria(true);
    try {
      const res = await fetch(`/api/diarias/${diariaEdit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor: diariaEditForm.valor ? parseFloat(diariaEditForm.valor.replace(",", ".")) : 0,
          motivo: diariaEditForm.motivo || null,
          observacoes: diariaEditForm.observacoes || null,
        }),
      });
      if (!res.ok) { toast.error("Erro ao salvar"); return; }
      toast.success("Diária atualizada");
      setDiariaEdit(null);
      fetchData();
    } finally {
      setSavingDiaria(false);
    }
  }

  function openDiariaPagar(d: any) {
    setDiariaPagar(d);
    setDiariaPagarForm({
      dataPagamento: new Date().toISOString().slice(0, 10),
      formaPagamento: "PIX",
    });
  }

  async function handlePagarDiaria() {
    if (!diariaPagar) return;
    setSavingDiaria(true);
    try {
      const res = await fetch(`/api/diarias/${diariaPagar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "PAGA",
          dataPagamento: diariaPagarForm.dataPagamento,
          formaPagamento: diariaPagarForm.formaPagamento,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao registrar pagamento"); return; }
      toast.success("Diária paga — lançamento criado em Financeiro");
      setDiariaPagar(null);
      fetchData();
    } finally {
      setSavingDiaria(false);
    }
  }

  const diariasPendentes = diarias.filter((d) => d.status === "PENDENTE");
  const diariasPagas = diarias.filter((d) => d.status === "PAGA");
  const totalDiariasPendentes = diariasPendentes.reduce((s, d) => s + (d.valor || 0), 0);
  const diariasPendentesValor = diariasPendentes.filter((d) => d.valor === 0).length;

  // Agrupamento por cliente
  const diariasPorCliente: Record<string, { clienteNome: string; clienteCnpj: string; itens: any[]; total: number; pendenteValor: number }> = {};
  for (const d of diariasPendentes) {
    if (!diariasPorCliente[d.clienteCnpj]) {
      diariasPorCliente[d.clienteCnpj] = { clienteNome: d.clienteNome, clienteCnpj: d.clienteCnpj, itens: [], total: 0, pendenteValor: 0 };
    }
    diariasPorCliente[d.clienteCnpj].itens.push(d);
    diariasPorCliente[d.clienteCnpj].total += d.valor || 0;
    if (d.valor === 0) diariasPorCliente[d.clienteCnpj].pendenteValor += 1;
  }
  const gruposDiarias = Object.values(diariasPorCliente).sort((a, b) => a.clienteNome.localeCompare(b.clienteNome));

  if (loading) return <><Topbar title="Faturamento" /><Loading /></>;

  const tabBtn = (key: TabKey, label: string, Icon: any, count?: number) => (
    <button
      onClick={() => setTab(key)}
      className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
        tab === key ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text2)]"
      }`}
    >
      <Icon size={14} /> {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1 px-1.5 py-0.5 text-[9px] font-mono rounded bg-[var(--surface2)]">{count}</span>
      )}
    </button>
  );

  return (
    <>
      <Topbar
        title="Faturamento"
        subtitle="Controle de fretes e armazenagem a receber"
        actions={<Button variant="ghost" size="sm" onClick={fetchData}><RefreshCw size={14} /> Atualizar</Button>}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "var(--text3)" }}>CT-es Pendentes</div>
            <div className="text-xl font-bold font-mono" style={{ color: "#f97316" }}>{formatCurrency(totalPendenteCtes)}</div>
            <div className="text-[10px]" style={{ color: "var(--text3)" }}>{ctesAgrupados.reduce((s, g) => s + g.ctes.length, 0)} CT-e(s)</div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "var(--text3)" }}>Armazenagem Pendente</div>
            <div className="text-xl font-bold font-mono" style={{ color: "#3b82f6" }}>{formatCurrency(totalArmPendente)}</div>
            <div className="text-[10px]" style={{ color: "var(--text3)" }}>
              {armazenagemPendente.length} fornecedor(es) · {armazenagemPendente.reduce((s: number, g: any) => s + g.totalPaletes, 0)} palete(s)
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "var(--text3)" }}>Faturas em Aberto</div>
            <div className="text-xl font-bold font-mono" style={{ color: "#eab308" }}>{formatCurrency(totalFaturasAbertas)}</div>
            <div className="text-[10px]" style={{ color: "var(--text3)" }}>
              {faturas.filter((f) => f.status === "ABERTA").length + faturasArm.filter((f: any) => f.status === "ABERTA").length} fatura(s)
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "var(--text3)" }}>Faturas Pagas</div>
            <div className="text-xl font-bold font-mono" style={{ color: "#10b981" }}>{formatCurrency(totalFaturasPagas)}</div>
            <div className="text-[10px]" style={{ color: "var(--text3)" }}>
              {faturas.filter((f) => f.status === "PAGA").length + faturasArm.filter((f: any) => f.status === "PAGA").length} fatura(s)
            </div>
          </Card>
        </div>

        {/* Pesquisa */}
        <div className="relative w-full max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por CT-e, NF, cliente, fornecedor..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {tabBtn("fretes", "Fretes (CT-es)", Truck, ctesAgrupados.reduce((s, g) => s + g.ctes.length, 0))}
          {tabBtn("armazenagem", "Armazenagem", Warehouse, armazenagemPendente.reduce((s: number, g: any) => s + g.entregas.length, 0))}
          {tabBtn("diarias", "Diárias", DollarSign, diariasPendentes.length)}
          {tabBtn("faturas", "Faturas", Receipt, faturas.length + faturasArm.length)}
          {tabBtn("transportadoras", "Transportadoras", Truck)}
        </div>

        {/* ─── TAB: FRETES ─────────────────────────────────────── */}
        {tab === "fretes" && (
          <>
            {selectedCteIds.length > 0 && (
              <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)" }}>
                <div>
                  <span className="text-sm font-semibold" style={{ color: "#10b981" }}>
                    {selectedCteIds.length} CT-e(s) — {faturandoClient?.tomadorNome}
                  </span>
                  <span className="text-sm font-mono font-bold ml-3" style={{ color: "#10b981" }}>{formatCurrency(selectedTotal)}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedCteIds([]); setFaturandoClient(null); }}>Limpar</Button>
                  <Button size="sm" onClick={openGerarModal}><FilePlus size={14} /> Gerar Fatura</Button>
                </div>
              </div>
            )}

            {filteredCtes.length === 0 ? (
              <Card><Empty icon="🧾" text={debouncedSearch ? "Nenhum CT-e encontrado" : "Nenhum CT-e pendente de faturamento"} /></Card>
            ) : (
              <div className="space-y-3">
                {filteredCtes.map((g) => {
                  const expanded = expandedGroups.includes(g.tomadorCnpj);
                  const allSelected = g.ctes.every((c: any) => selectedCteIds.includes(c.id));
                  return (
                    <Card key={g.tomadorCnpj} className="p-0 overflow-hidden">
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--surface2)] transition-colors" onClick={() => toggleGroup(g.tomadorCnpj)}>
                        <div>
                          <div className="font-semibold text-sm">{g.tomadorNome}</div>
                          <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                            {formatCNPJ(g.tomadorCnpj)} &bull; {g.ctes.length} CT-e(s) &bull; Total: {formatCurrency(g.totalValor)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost"
                            onClick={(e) => { e.stopPropagation(); allSelected ? (setSelectedCteIds([]), setFaturandoClient(null)) : selectAllFromGroup(g); }}>
                            {allSelected ? "Desmarcar" : "Selecionar Todos"}
                          </Button>
                          {expanded ? <ChevronUp size={16} style={{ color: "var(--text3)" }} /> : <ChevronDown size={16} style={{ color: "var(--text3)" }} />}
                        </div>
                      </div>
                      {expanded && (
                        <div style={{ borderTop: "1px solid var(--border)" }}>
                          <Table>
                            <thead>
                              <tr>
                                <Th className="w-10"></Th>
                                <Th>CT-e</Th>
                                <Th>NFs Vinculadas</Th>
                                <Th>Emissão</Th>
                                <Th>Valor a Receber</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.ctes.map((cte: any) => (
                                <Tr key={cte.id}>
                                  <Td>
                                    <input type="checkbox" className="w-4 h-4 accent-emerald-500 cursor-pointer"
                                      checked={selectedCteIds.includes(cte.id)}
                                      onChange={() => toggleCte(cte.id, g)} />
                                  </Td>
                                  <Td><span className="font-mono text-xs font-bold">{cte.numero}</span></Td>
                                  <Td>
                                    <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                                      {cte.notas?.length > 0 ? cte.notas.map((n: any) => n.numero).join(", ") : "—"}
                                    </span>
                                  </Td>
                                  <Td><span className="font-mono text-xs">{formatDate(cte.dataEmissao)}</span></Td>
                                  <Td><span className="font-mono text-sm font-bold" style={{ color: "#10b981" }}>{formatCurrency(cte.valorReceber)}</span></Td>
                                </Tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── TAB: ARMAZENAGEM ────────────────────────────────── */}
        {tab === "armazenagem" && (
          <>
            {selectedArmIds.length > 0 && (
              <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.25)" }}>
                <div>
                  <span className="text-sm font-semibold" style={{ color: "#3b82f6" }}>
                    {selectedArmIds.length} entrega(s) — {armFornecedor?.nomeCliente}
                  </span>
                  <span className="text-sm font-mono font-bold ml-3" style={{ color: "#3b82f6" }}>{formatCurrency(selectedArmTotal)}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedArmIds([]); setArmFornecedor(null); }}>Limpar</Button>
                  <Button size="sm" onClick={openGerarArmModal}><FilePlus size={14} /> Gerar Fatura de Armazenagem</Button>
                </div>
              </div>
            )}

            <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
              Valores calculados automaticamente pela tabela do fornecedor (configurável em Configurações).
            </div>

            {filteredArm.length === 0 ? (
              <Card><Empty icon="📦" text={debouncedSearch ? "Nenhuma armazenagem encontrada" : "Nenhuma armazenagem pendente"} /></Card>
            ) : (
              <div className="space-y-3">
                {filteredArm.map((g: any) => {
                  const expanded = expandedArmazens.includes(g.cnpjCliente);
                  const allSelected = g.entregas.every((e: any) => selectedArmIds.includes(e.id));
                  return (
                    <Card key={g.cnpjCliente} className="p-0 overflow-hidden">
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--surface2)] transition-colors"
                        onClick={() => setExpandedArmazens((prev) => prev.includes(g.cnpjCliente) ? prev.filter((c) => c !== g.cnpjCliente) : [...prev, g.cnpjCliente])}>
                        <div>
                          <div className="font-semibold text-sm flex items-center gap-2">
                            <Warehouse size={13} className="text-blue-500" />
                            {g.nomeCliente}
                          </div>
                          <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                            {formatCNPJ(g.cnpjCliente)} &bull; {g.entregas.length} entrega(s) &bull; {g.totalPaletes} palete(s)
                            &bull; Tabela: {formatCurrency(g.valorPaleteDia)}/palete/dia · {g.diasFree} dias free
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button size="sm" variant="ghost"
                            onClick={(e) => { e.stopPropagation(); allSelected ? (setSelectedArmIds([]), setArmFornecedor(null)) : selectAllFromArmGroup(g); }}>
                            {allSelected ? "Desmarcar" : "Selecionar Todos"}
                          </Button>
                          <span className="font-mono text-sm font-bold" style={{ color: "#3b82f6" }}>{formatCurrency(g.totalValor)}</span>
                          {expanded ? <ChevronUp size={16} style={{ color: "var(--text3)" }} /> : <ChevronDown size={16} style={{ color: "var(--text3)" }} />}
                        </div>
                      </div>
                      {expanded && (
                        <div style={{ borderTop: "1px solid var(--border)" }}>
                          <Table>
                            <thead>
                              <tr>
                                <Th className="w-10"></Th>
                                <Th>Entrega</Th>
                                <Th>Paletes</Th>
                                <Th>Entrada</Th>
                                <Th>Saída</Th>
                                <Th>Dias</Th>
                                <Th>Cobráveis</Th>
                                <Th>Valor</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.entregas.map((e: any) => (
                                <Tr key={e.id}>
                                  <Td>
                                    <input type="checkbox" className="w-4 h-4 accent-blue-500 cursor-pointer"
                                      checked={selectedArmIds.includes(e.id)}
                                      onChange={() => toggleArmEntrega(e.id, g)} />
                                  </Td>
                                  <Td>
                                    <div className="text-xs font-mono font-bold">{e.codigo}</div>
                                    <div className="text-[10px]" style={{ color: "var(--text3)" }}>
                                      {e.nfs?.length > 0 && <span className="font-mono">NF {e.nfs.join(", ")} · </span>}
                                      {e.destinatarioRazao || e.razaoSocial} · {e.cidade}
                                    </div>
                                  </Td>
                                  <Td><span className="font-mono text-xs">{e.quantidadePaletes}</span></Td>
                                  <Td><span className="font-mono text-[10px]">{formatDate(e.dataEntrada)}</span></Td>
                                  <Td><span className="font-mono text-[10px]">{e.dataSaida ? formatDate(e.dataSaida) : <span style={{ color: "var(--text3)" }}>em aberto</span>}</span></Td>
                                  <Td><span className="font-mono text-xs">{e.diasDecorridos}</span></Td>
                                  <Td>
                                    <span className="font-mono text-xs font-bold" style={{ color: e.diasCobraveis > 0 ? "#f97316" : "var(--text3)" }}>
                                      {e.diasCobraveis}
                                    </span>
                                  </Td>
                                  <Td><span className="font-mono text-sm font-bold" style={{ color: "#3b82f6" }}>{formatCurrency(e.valorCalculado)}</span></Td>
                                </Tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── TAB: DIÁRIAS ────────────────────────────────────── */}
        {tab === "diarias" && (
          <div className="space-y-4">
            {/* Header + KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="p-4">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "var(--text3)" }}>Total Pendente</div>
                <div className="text-xl font-bold font-mono" style={{ color: "#d97706" }}>{formatCurrency(totalDiariasPendentes)}</div>
                <div className="text-[10px]" style={{ color: "var(--text3)" }}>{diariasPendentes.length} diária(s)</div>
              </Card>
              <Card className="p-4">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "var(--text3)" }}>Pendentes de Valor</div>
                <div className="text-xl font-bold font-mono" style={{ color: "#f97316" }}>{diariasPendentesValor}</div>
                <div className="text-[10px]" style={{ color: "var(--text3)" }}>precisam ser preenchidas</div>
              </Card>
              <Card className="p-4">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "var(--text3)" }}>Já Pagas</div>
                <div className="text-xl font-bold font-mono" style={{ color: "#059669" }}>{diariasPagas.length}</div>
                <button onClick={() => setShowDiariaHist((v) => !v)}
                  className="text-[10px] hover:underline" style={{ color: "var(--accent)" }}>
                  {showDiariaHist ? "Ocultar histórico" : "Ver histórico"}
                </button>
              </Card>
            </div>

            {/* Pendentes agrupadas por cliente */}
            {gruposDiarias.length === 0 ? (
              <Card><Empty icon="💰" text="Nenhuma diária pendente" /></Card>
            ) : (
              <div className="space-y-3">
                {gruposDiarias.map((grupo) => (
                  <Card key={grupo.clienteCnpj} className="p-0 overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between"
                      style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                      <div>
                        <div className="text-sm font-bold">{grupo.clienteNome}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                          {formatCNPJ(grupo.clienteCnpj)} · {grupo.itens.length} diária(s)
                          {grupo.pendenteValor > 0 && <> · <span style={{ color: "#d97706", fontWeight: "bold" }}>{grupo.pendenteValor} sem valor</span></>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] uppercase" style={{ color: "var(--text3)" }}>Total</div>
                        <div className="text-sm font-mono font-bold" style={{ color: "#d97706" }}>{formatCurrency(grupo.total)}</div>
                      </div>
                    </div>
                    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                      {grupo.itens.map((d: any) => {
                        const isPendenteValor = d.valor === 0;
                        return (
                          <div key={d.id} className="px-4 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold font-mono" style={{ color: "#b45309" }}>{d.numero}</span>
                                {d.entrega && (
                                  <button onClick={() => window.open(`/entregas/${d.entrega.id}`, "_blank")}
                                    className="text-[10px] font-mono hover:underline"
                                    style={{ color: "var(--accent)" }}>
                                    Entrega {d.entrega.codigo}
                                  </button>
                                )}
                                <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatDate(d.dataOcorrencia)}</span>
                                {isPendenteValor && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1"
                                    style={{ background: "rgba(217,119,6,.15)", color: "#d97706" }}>
                                    <AlertTriangle size={9} /> VALOR PENDENTE
                                  </span>
                                )}
                              </div>
                              {d.motivo && (
                                <div className="text-[11px] mt-0.5" style={{ color: "var(--text2)" }}>{d.motivo}</div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold font-mono" style={{ color: d.valor > 0 ? "#059669" : "#d97706" }}>
                                {d.valor > 0 ? formatCurrency(d.valor) : "—"}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openDiariaEdit(d)}
                                className="p-1.5 rounded hover:bg-slate-100"
                                title="Editar valor / motivo"
                              >
                                <Edit2 size={13} className="text-slate-500" />
                              </button>
                              <button
                                onClick={() => openDiariaPagar(d)}
                                disabled={isPendenteValor}
                                className="text-[10px] font-bold px-2 py-1 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ background: "#059669", color: "white" }}
                                title={isPendenteValor ? "Preencha o valor antes" : "Registrar recebimento"}
                              >
                                <CheckCircle2 size={11} className="inline mr-0.5" /> Receber
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Histórico de pagas */}
            {showDiariaHist && (
              <Card className="p-0 overflow-hidden">
                <div className="px-4 py-3 border-b" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                  <div className="text-sm font-bold">Histórico — Diárias Pagas</div>
                </div>
                {diariasPagas.length === 0 ? (
                  <Empty icon="✓" text="Nenhuma diária paga ainda" />
                ) : (
                  <Table>
                    <thead>
                      <Tr>
                        <Th>Número</Th>
                        <Th>Cliente</Th>
                        <Th>Entrega</Th>
                        <Th>Motivo</Th>
                        <Th>Data Pagamento</Th>
                        <Th className="text-right">Valor</Th>
                      </Tr>
                    </thead>
                    <tbody>
                      {diariasPagas.map((d) => (
                        <Tr key={d.id}>
                          <Td><span className="font-mono font-bold" style={{ color: "#b45309" }}>{d.numero}</span></Td>
                          <Td>{d.clienteNome}</Td>
                          <Td>{d.entrega?.codigo || "—"}</Td>
                          <Td className="text-xs">{d.motivo || "—"}</Td>
                          <Td>{d.dataPagamento ? formatDate(d.dataPagamento) : "—"}</Td>
                          <Td className="text-right font-mono font-bold" style={{ color: "#059669" }}>{formatCurrency(d.valor)}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ─── TAB: FATURAS ────────────────────────────────────── */}
        {tab === "faturas" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-head font-bold mb-3 flex items-center gap-2" style={{ color: "var(--text2)" }}>
                <Truck size={14} /> Faturas de Frete
              </h2>
              <Card className="p-0 overflow-hidden">
                {filteredFaturas.length === 0 ? (
                  <Empty icon="💸" text={debouncedSearch ? "Nenhuma fatura encontrada" : "Nenhuma fatura gerada"} />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Fatura</Th>
                        <Th>Cliente</Th>
                        <Th>CT-es</Th>
                        <Th>Vencimento</Th>
                        <Th>Valor Total</Th>
                        <Th>Status</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFaturas.map((f) => (
                        <Tr key={f.id}>
                          <Td><span className="font-mono text-xs font-bold">{f.numero}</span></Td>
                          <Td>
                            <div className="text-sm font-semibold">{f.clienteNome}</div>
                            <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(f.clienteCnpj)}</div>
                          </Td>
                          <Td><span className="font-mono text-xs">{f._count?.ctes || 0}</span></Td>
                          <Td>
                            <span className={`font-mono text-xs ${f.status !== "PAGA" && new Date(f.dataVencimento) < new Date() ? "text-red-500 font-bold" : ""}`}>
                              {formatDate(f.dataVencimento)}
                            </span>
                          </Td>
                          <Td><span className="font-mono text-sm font-bold" style={{ color: "#10b981" }}>{formatCurrency(f.valorTotal)}</span></Td>
                          <Td>
                            <span className={`px-2 py-1 text-[10px] font-bold rounded-lg ${
                              f.status === "PAGA" ? "bg-emerald-400/10 text-emerald-500 border border-emerald-400/30"
                              : f.status === "CANCELADA" ? "bg-red-400/10 text-red-400 border border-red-400/30"
                              : "bg-yellow-400/10 text-yellow-600 border border-yellow-400/30"
                            }`}>{f.status}</span>
                          </Td>
                          <Td>
                            <div className="flex gap-1.5">
                              <button onClick={() => setFaturaDetalhe(f)}
                                className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                                style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                                <Eye size={12} />
                              </button>
                              {f.status === "ABERTA" && (
                                <Button size="sm" variant="ghost" onClick={() => handleDarBaixa(f.id)}>
                                  <CheckCircle2 size={12} /> Baixa
                                </Button>
                              )}
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </div>

            <div>
              <h2 className="text-sm font-head font-bold mb-3 flex items-center gap-2" style={{ color: "var(--text2)" }}>
                <Warehouse size={14} /> Faturas de Armazenagem
              </h2>
              <Card className="p-0 overflow-hidden">
                {filteredFaturasArm.length === 0 ? (
                  <Empty icon="📦" text={debouncedSearch ? "Nenhuma fatura encontrada" : "Nenhuma fatura de armazenagem gerada"} />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Fatura</Th>
                        <Th>Fornecedor</Th>
                        <Th>Itens</Th>
                        <Th>Vencimento</Th>
                        <Th>Valor Total</Th>
                        <Th>Status</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFaturasArm.map((f: any) => (
                        <Tr key={f.id}>
                          <Td><span className="font-mono text-xs font-bold">{f.numero}</span></Td>
                          <Td>
                            <div className="text-sm font-semibold">{f.fornecedorNome}</div>
                            <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(f.fornecedorCnpj)}</div>
                          </Td>
                          <Td><span className="font-mono text-xs">{f._count?.items ?? f.items?.length ?? 0}</span></Td>
                          <Td>
                            <span className={`font-mono text-xs ${f.status !== "PAGA" && new Date(f.dataVencimento) < new Date() ? "text-red-500 font-bold" : ""}`}>
                              {formatDate(f.dataVencimento)}
                            </span>
                          </Td>
                          <Td><span className="font-mono text-sm font-bold" style={{ color: "#3b82f6" }}>{formatCurrency(f.valorTotal)}</span></Td>
                          <Td>
                            <span className={`px-2 py-1 text-[10px] font-bold rounded-lg ${
                              f.status === "PAGA" ? "bg-emerald-400/10 text-emerald-500 border border-emerald-400/30"
                              : f.status === "CANCELADA" ? "bg-red-400/10 text-red-400 border border-red-400/30"
                              : "bg-yellow-400/10 text-yellow-600 border border-yellow-400/30"
                            }`}>{f.status}</span>
                          </Td>
                          <Td>
                            <div className="flex gap-1.5">
                              <button onClick={() => setFaturaArmDetalhe(f)}
                                className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                                style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                                <Eye size={12} />
                              </button>
                              {f.status === "ABERTA" && (
                                <Button size="sm" variant="ghost" onClick={() => handleDarBaixaArm(f.id)}>
                                  <CheckCircle2 size={12} /> Baixa
                                </Button>
                              )}
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Modal Gerar Fatura de Frete */}
      <Modal open={showGerarModal} onClose={() => setShowGerarModal(false)} title="Gerar Fatura" size="sm">
        <div className="space-y-4">
          <div className="p-3 rounded-lg" style={{ background: "var(--surface2)" }}>
            <div className="text-sm font-semibold">{faturandoClient?.tomadorNome}</div>
            <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(faturandoClient?.tomadorCnpj || "")}</div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs" style={{ color: "var(--text2)" }}>{selectedCteIds.length} CT-e(s) selecionado(s)</span>
            <span className="font-mono text-lg font-bold" style={{ color: "#10b981" }}>{formatCurrency(selectedTotal)}</span>
          </div>
          <Input label="Data de Vencimento" type="date" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowGerarModal(false)}>Cancelar</Button>
          <Button onClick={handleGerarFatura} loading={gerando}><FilePlus size={14} /> Gerar Fatura</Button>
        </div>
      </Modal>

      {/* Modal Gerar Fatura de Armazenagem */}
      <Modal open={showGerarArmModal} onClose={() => setShowGerarArmModal(false)} title="Gerar Fatura de Armazenagem" size="sm">
        <div className="space-y-4">
          <div className="p-3 rounded-lg" style={{ background: "var(--surface2)" }}>
            <div className="text-sm font-semibold">{armFornecedor?.nomeCliente}</div>
            <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(armFornecedor?.cnpjCliente || "")}</div>
            <div className="text-[10px] font-mono mt-1" style={{ color: "var(--text3)" }}>
              {formatCurrency(armFornecedor?.valorPaleteDia || 0)}/palete/dia · {armFornecedor?.diasFree || 0} dias free
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs" style={{ color: "var(--text2)" }}>{selectedArmIds.length} entrega(s) selecionada(s)</span>
            <span className="font-mono text-lg font-bold" style={{ color: "#3b82f6" }}>{formatCurrency(selectedArmTotal)}</span>
          </div>
          <Input label="Data de Vencimento" type="date" value={dataVencArm} onChange={(e) => setDataVencArm(e.target.value)} />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowGerarArmModal(false)}>Cancelar</Button>
          <Button onClick={handleGerarArmFatura} loading={gerandoArm}><FilePlus size={14} /> Gerar Fatura</Button>
        </div>
      </Modal>

      {/* Modal Detalhe Fatura Frete */}
      <Modal open={!!faturaDetalhe} onClose={() => setFaturaDetalhe(null)} title={`Fatura ${faturaDetalhe?.numero || ""}`} size="md">
        {faturaDetalhe && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">Cliente</div>
                <div className="text-sm font-semibold">{faturaDetalhe.clienteNome}</div>
                <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(faturaDetalhe.clienteCnpj)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">Vencimento</div>
                <div className="text-sm font-mono">{formatDate(faturaDetalhe.dataVencimento)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">Valor Total</div>
                <div className="text-lg font-mono font-bold" style={{ color: "#10b981" }}>{formatCurrency(faturaDetalhe.valorTotal)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">Status</div>
                <span className={`px-2 py-1 text-[10px] font-bold rounded-lg ${faturaDetalhe.status === "PAGA" ? "bg-emerald-400/10 text-emerald-500" : "bg-yellow-400/10 text-yellow-600"}`}>
                  {faturaDetalhe.status}
                </span>
              </div>
            </div>
            {faturaDetalhe.ctes?.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">CT-es Incluídos</div>
                <div className="space-y-1.5">
                  {faturaDetalhe.ctes.map((cte: any) => (
                    <div key={cte.id} className="flex justify-between items-center p-2 rounded-lg" style={{ background: "var(--surface2)" }}>
                      <span className="font-mono text-xs font-bold">CT-e {cte.numero}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatDate(cte.dataEmissao)}</span>
                        <span className="font-mono text-xs font-bold" style={{ color: "#10b981" }}>{formatCurrency(cte.valorReceber)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Detalhe Fatura Armazenagem */}
      <Modal open={!!faturaArmDetalhe} onClose={() => setFaturaArmDetalhe(null)} title={`Fatura ${faturaArmDetalhe?.numero || ""}`} size="lg">
        {faturaArmDetalhe && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">Fornecedor</div>
                <div className="text-sm font-semibold">{faturaArmDetalhe.fornecedorNome}</div>
                <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(faturaArmDetalhe.fornecedorCnpj)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">Vencimento</div>
                <div className="text-sm font-mono">{formatDate(faturaArmDetalhe.dataVencimento)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">Valor Total</div>
                <div className="text-lg font-mono font-bold" style={{ color: "#3b82f6" }}>{formatCurrency(faturaArmDetalhe.valorTotal)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">Status</div>
                <span className={`px-2 py-1 text-[10px] font-bold rounded-lg ${faturaArmDetalhe.status === "PAGA" ? "bg-emerald-400/10 text-emerald-500" : "bg-yellow-400/10 text-yellow-600"}`}>
                  {faturaArmDetalhe.status}
                </span>
              </div>
            </div>
            {faturaArmDetalhe.items?.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">Entregas Cobradas</div>
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Entrega</Th>
                        <Th>NFs</Th>
                        <Th>Paletes</Th>
                        <Th>Entrada</Th>
                        <Th>Saída</Th>
                        <Th>Dias/Cobr.</Th>
                        <Th>Valor</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {faturaArmDetalhe.items.map((it: any) => (
                        <Tr key={it.id}>
                          <Td>
                            <div className="text-xs font-mono font-bold">{it.codigoEntrega}</div>
                            <div className="text-[10px]" style={{ color: "var(--text3)" }}>
                              {it.destinatarioRazao} · {it.cidade}
                            </div>
                          </Td>
                          <Td><span className="font-mono text-[10px]">{it.nfs || "—"}</span></Td>
                          <Td><span className="font-mono text-xs">{it.paletes}</span></Td>
                          <Td><span className="font-mono text-[10px]">{it.dataEntrada ? formatDate(it.dataEntrada) : "—"}</span></Td>
                          <Td><span className="font-mono text-[10px]">{it.dataSaida ? formatDate(it.dataSaida) : <span style={{ color: "var(--text3)" }}>em aberto</span>}</span></Td>
                          <Td><span className="font-mono text-xs">{it.diasDecorridos}/{it.diasCobraveis}</span></Td>
                          <Td><span className="font-mono text-xs font-bold" style={{ color: "#3b82f6" }}>{formatCurrency(it.valorCalculado)}</span></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" size="sm" onClick={() => handleExcluirArm(faturaArmDetalhe.id)}>
                <Trash2 size={12} /> Excluir
              </Button>
              {faturaArmDetalhe.status === "ABERTA" && (
                <Button size="sm" onClick={() => handleDarBaixaArm(faturaArmDetalhe.id)}>
                  <CheckCircle2 size={12} /> Marcar como PAGA
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Editar Diária */}
      <Modal open={!!diariaEdit} onClose={() => setDiariaEdit(null)} title={`Editar Diária ${diariaEdit?.numero || ""}`} size="sm">
        {diariaEdit && (
          <div className="space-y-4">
            <div className="text-xs p-3 rounded-lg" style={{ background: "var(--surface2)", color: "var(--text2)" }}>
              Entrega <strong>{diariaEdit.entrega?.codigo}</strong> — {diariaEdit.clienteNome}
            </div>
            <Input
              label="Valor (R$)"
              type="text"
              value={diariaEditForm.valor}
              onChange={(e) => setDiariaEditForm((f) => ({ ...f, valor: e.target.value }))}
              placeholder="0,00"
            />
            <Input
              label="Motivo"
              value={diariaEditForm.motivo}
              onChange={(e) => setDiariaEditForm((f) => ({ ...f, motivo: e.target.value }))}
              placeholder="ex: atraso 1 dia"
            />
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Observações</label>
              <textarea
                value={diariaEditForm.observacoes}
                onChange={(e) => setDiariaEditForm((f) => ({ ...f, observacoes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm border"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="ghost" onClick={() => setDiariaEdit(null)}>Cancelar</Button>
          <Button onClick={handleSaveDiariaValor} loading={savingDiaria}>Salvar</Button>
        </div>
      </Modal>

      {/* Registrar recebimento */}
      <Modal open={!!diariaPagar} onClose={() => setDiariaPagar(null)} title={`Registrar Recebimento — ${diariaPagar?.numero || ""}`} size="sm">
        {diariaPagar && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl flex items-start gap-2" style={{ background: "rgba(5,150,105,.08)", border: "1px solid rgba(5,150,105,.3)" }}>
              <CheckCircle2 size={16} style={{ color: "#059669", flexShrink: 0, marginTop: 1 }} />
              <div className="text-xs" style={{ color: "var(--text2)" }}>
                Confirmando o recebimento de <strong>{formatCurrency(diariaPagar.valor)}</strong> de <strong>{diariaPagar.clienteNome}</strong>. Um lançamento RECEITA será criado em Financeiro.
              </div>
            </div>
            <Input
              label="Data do Pagamento"
              type="date"
              value={diariaPagarForm.dataPagamento}
              onChange={(e) => setDiariaPagarForm((f) => ({ ...f, dataPagamento: e.target.value }))}
            />
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Forma de Pagamento</label>
              <select
                value={diariaPagarForm.formaPagamento}
                onChange={(e) => setDiariaPagarForm((f) => ({ ...f, formaPagamento: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm border"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <option value="PIX">PIX</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="BOLETO">Boleto</option>
                <option value="CARTAO_CREDITO">Cartão Crédito</option>
                <option value="CARTAO_DEBITO">Cartão Débito</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="ghost" onClick={() => setDiariaPagar(null)}>Cancelar</Button>
          <Button onClick={handlePagarDiaria} loading={savingDiaria}>
            <CheckCircle2 size={13} /> Confirmar Recebimento
          </Button>
        </div>
      </Modal>

      <TransportadorasTab active={tab === "transportadoras"} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// ABA TRANSPORTADORAS — Faturamento por acordo (ex: Porto Transp)
// ═══════════════════════════════════════════════════════════════

function TransportadorasTab({ active }: { active: boolean }) {
  const [acordos, setAcordos] = useState<any[]>([]);
  const [emitentes, setEmitentes] = useState<any[]>([]);
  const [selCnpj, setSelCnpj] = useState("");
  const hoje = new Date();
  const primDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const hojeStr = hoje.toISOString().slice(0, 10);
  const [inicio, setInicio] = useState(primDiaMes);
  const [fim, setFim] = useState(hojeStr);

  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [gerandoFatura, setGerandoFatura] = useState(false);
  const [faturasGeradas, setFaturasGeradas] = useState<any[]>([]);

  const [showAcordoModal, setShowAcordoModal] = useState(false);
  const [acordoEdit, setAcordoEdit] = useState<any>({ id: null, transportadoraCnpj: "", transportadoraNome: "", percentualCTE: 20, taxaEntrega: 0, valorPaleteFixo: 0 });
  const [savingAcordo, setSavingAcordo] = useState(false);

  const loadAcordos = useCallback(async () => {
    const r = await fetch("/api/acordos-transportadora");
    if (r.ok) { const d = await r.json(); setAcordos(d.acordos || []); }
  }, []);
  const loadEmitentes = useCallback(async () => {
    const r = await fetch("/api/ctes/emitentes");
    if (r.ok) { const d = await r.json(); setEmitentes(d.emitentes || []); }
  }, []);
  const loadFaturas = useCallback(async (cnpj: string) => {
    if (!cnpj) { setFaturasGeradas([]); return; }
    const r = await fetch(`/api/faturamento/transportadora/list?transportadoraCnpj=${cnpj}`);
    if (r.ok) { const d = await r.json(); setFaturasGeradas(d.faturas || []); }
  }, []);

  useEffect(() => { if (active) { loadAcordos(); loadEmitentes(); } }, [active, loadAcordos, loadEmitentes]);
  useEffect(() => { loadFaturas(selCnpj); }, [selCnpj, loadFaturas]);

  async function handlePreview() {
    if (!selCnpj) { toast.error("Selecione uma transportadora"); return; }
    setLoadingPreview(true); setPreview(null);
    try {
      const r = await fetch(`/api/faturamento/transportadora?transportadoraCnpj=${selCnpj}&inicio=${inicio}&fim=${fim}`);
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Erro"); return; }
      setPreview(d);
    } finally { setLoadingPreview(false); }
  }

  async function handleGerar() {
    if (!preview || preview.items.length === 0) return;
    setGerandoFatura(true);
    try {
      const r = await fetch("/api/faturamento/transportadora", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transportadoraCnpj: selCnpj, inicio, fim }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao gerar");
      toast.success(`Fatura ${d.numero} gerada`);
      loadFaturas(selCnpj);
    } catch (e: any) { toast.error(e.message); } finally { setGerandoFatura(false); }
  }

  function openAcordoNovo() {
    const em = emitentes.find((e) => e.cnpj === selCnpj);
    setAcordoEdit({ id: null, transportadoraCnpj: selCnpj || "", transportadoraNome: em?.nome || "", percentualCTE: 20, taxaEntrega: 0, valorPaleteFixo: 0 });
    setShowAcordoModal(true);
  }
  function openAcordoEdit(a: any) {
    setAcordoEdit({ ...a });
    setShowAcordoModal(true);
  }
  async function saveAcordo() {
    setSavingAcordo(true);
    try {
      const url = acordoEdit.id ? `/api/acordos-transportadora/${acordoEdit.id}` : "/api/acordos-transportadora";
      const method = acordoEdit.id ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(acordoEdit) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro");
      toast.success("Acordo salvo");
      setShowAcordoModal(false);
      loadAcordos();
    } catch (e: any) { toast.error(e.message); } finally { setSavingAcordo(false); }
  }
  async function deleteAcordo(id: string) {
    if (!confirm("Excluir acordo?")) return;
    const r = await fetch(`/api/acordos-transportadora/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Removido"); loadAcordos(); } else toast.error("Erro");
  }

  if (!active) return null;

  const acordoAtual = acordos.find((a) => a.transportadoraCnpj === selCnpj);
  const opts = acordos.map((a) => ({ cnpj: a.transportadoraCnpj, nome: a.transportadoraNome }));
  emitentes.forEach((e) => { if (!opts.find((o) => o.cnpj === e.cnpj)) opts.push({ cnpj: e.cnpj, nome: `${e.nome} (sem acordo)` }); });

  return (
    <div className="mt-4 space-y-4">
      {/* Cabeçalho + acordos */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Acordos de Transportadora</div>
          <Button size="sm" onClick={openAcordoNovo}><FilePlus size={13} /> Novo Acordo</Button>
        </div>
        {acordos.length === 0 ? (
          <div className="text-xs" style={{ color: "var(--text3)" }}>Nenhum acordo cadastrado. Clique em "Novo Acordo" pra começar.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {acordos.map((a) => (
              <div key={a.id} className="p-3 rounded-lg text-xs" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{a.transportadoraNome}</div>
                    <div className="font-mono text-[10px]" style={{ color: "var(--text3)" }}>{formatCNPJ(a.transportadoraCnpj)}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openAcordoEdit(a)} title="Editar" style={{ color: "var(--text2)" }}><Edit2 size={12} /></button>
                    <button onClick={() => deleteAcordo(a.id)} title="Excluir" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="mt-2 space-y-0.5 font-mono text-[10px]" style={{ color: "var(--text2)" }}>
                  <div>% CT-e: <b>{a.percentualCTE}%</b></div>
                  <div>Taxa entrega: <b>{formatCurrency(a.taxaEntrega)}</b></div>
                  <div>Palete fixo: <b>{formatCurrency(a.valorPaleteFixo)}</b></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-[10px] font-mono uppercase mb-1 block" style={{ color: "var(--text3)" }}>Transportadora</label>
            <select value={selCnpj} onChange={(e) => { setSelCnpj(e.target.value); setPreview(null); }}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}>
              <option value="">Selecione…</option>
              {opts.map((o) => <option key={o.cnpj} value={o.cnpj}>{o.nome}</option>)}
            </select>
          </div>
          <Input type="date" label="Início" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          <Input type="date" label="Fim" value={fim} onChange={(e) => setFim(e.target.value)} />
          <Button onClick={handlePreview} loading={loadingPreview} disabled={!selCnpj}>
            <RefreshCw size={13} /> Prévia
          </Button>
        </div>
        {selCnpj && !acordoAtual && (
          <div className="mt-3 p-2 rounded text-xs flex items-center gap-2" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", color: "#ef4444" }}>
            <AlertTriangle size={12} /> Cadastre o acordo desta transportadora acima antes de gerar.
          </div>
        )}
      </Card>

      {/* Prévia */}
      {preview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <MiniKpi label="% CT-e" val={preview.totais.valorPercentualCTE} />
            <MiniKpi label="Taxa Entrega" val={preview.totais.valorTaxaEntrega} />
            <MiniKpi label="Paletização" val={preview.totais.valorPaletizacao} />
            <MiniKpi label="Armazenagem" val={preview.totais.valorArmazenagem} />
            <MiniKpi label="Diárias" val={preview.totais.valorDiarias} />
            <MiniKpi label="Descarga" val={preview.totais.valorDescarga} />
            <MiniKpi label="TOTAL" val={preview.totais.valorTotal} highlight />
          </div>

          <Card className="overflow-hidden">
            <div className="p-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="text-xs" style={{ color: "var(--text2)" }}>
                <b>{preview.totais.totalCTes}</b> CT-e(s) · <b>{preview.totais.totalEntregas}</b> entrega(s)
              </div>
              <Button size="sm" onClick={handleGerar} loading={gerandoFatura} disabled={preview.items.length === 0}>
                <Receipt size={13} /> Gerar Fatura
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>CT-e</Th><Th>Entrega</Th><Th>Cliente</Th><Th>NFs</Th><Th>Pal.</Th>
                    <Th>% CT-e</Th><Th>Tx.Ent</Th><Th>Palet</Th><Th>Armaz</Th><Th>Diária</Th><Th>Desc</Th><Th>Subtotal</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((it: any, i: number) => (
                    <Tr key={i}>
                      <Td><span className="font-mono text-xs">{it.cteNumero || "—"}</span></Td>
                      <Td><span className="font-mono text-xs">{it.codigoEntrega}</span></Td>
                      <Td><span className="text-xs">{it.destinatarioRazao}</span></Td>
                      <Td><span className="font-mono text-[10px]">{it.nfs}</span></Td>
                      <Td><span className="font-mono text-xs">{it.quantidadePaletes}</span></Td>
                      <Td><span className="font-mono text-xs">{formatCurrency(it.valorPercentualCTE)}</span></Td>
                      <Td><span className="font-mono text-xs">{formatCurrency(it.valorTaxaEntrega)}</span></Td>
                      <Td><span className="font-mono text-xs">{formatCurrency(it.valorPaletizacao)}</span></Td>
                      <Td><span className="font-mono text-xs">{formatCurrency(it.valorArmazenagem)}</span></Td>
                      <Td><span className="font-mono text-xs">{formatCurrency(it.valorDiaria)}</span></Td>
                      <Td><span className="font-mono text-xs">{formatCurrency(it.valorDescarga)}</span></Td>
                      <Td><span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{formatCurrency(it.subtotal)}</span></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {/* Faturas persistidas */}
      {faturasGeradas.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Faturas geradas</div>
          <div className="space-y-2">
            {faturasGeradas.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-2 rounded text-xs"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-bold">{f.numero}</div>
                  <div className="text-[10px]" style={{ color: "var(--text3)" }}>
                    {formatDate(f.dataInicio)} → {formatDate(f.dataFim)} · {f.status}
                  </div>
                </div>
                <div className="font-mono font-bold" style={{ color: "var(--accent)" }}>{formatCurrency(f.valorTotal)}</div>
                <Button size="sm" variant="ghost" onClick={() => window.open(`/api/faturamento/transportadora/${f.id}/export`, "_blank")}>
                  <Eye size={12} /> XLSX
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal Acordo */}
      <Modal open={showAcordoModal} onClose={() => setShowAcordoModal(false)} title={acordoEdit.id ? "Editar Acordo" : "Novo Acordo"}>
        <div className="space-y-3">
          <Input label="CNPJ" value={acordoEdit.transportadoraCnpj} disabled={!!acordoEdit.id}
            onChange={(e) => setAcordoEdit((a: any) => ({ ...a, transportadoraCnpj: e.target.value.replace(/\D/g, "") }))} />
          <Input label="Nome" value={acordoEdit.transportadoraNome}
            onChange={(e) => setAcordoEdit((a: any) => ({ ...a, transportadoraNome: e.target.value }))} />
          <div className="grid grid-cols-3 gap-3">
            <Input type="number" step="0.01" label="% CT-e" value={acordoEdit.percentualCTE}
              onChange={(e) => setAcordoEdit((a: any) => ({ ...a, percentualCTE: Number(e.target.value) }))} />
            <Input type="number" step="0.01" label="Taxa Entrega (R$)" value={acordoEdit.taxaEntrega}
              onChange={(e) => setAcordoEdit((a: any) => ({ ...a, taxaEntrega: Number(e.target.value) }))} />
            <Input type="number" step="0.01" label="Palete Fixo (R$)" value={acordoEdit.valorPaleteFixo}
              onChange={(e) => setAcordoEdit((a: any) => ({ ...a, valorPaleteFixo: Number(e.target.value) }))} />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
            <Button variant="ghost" onClick={() => setShowAcordoModal(false)}>Cancelar</Button>
            <Button onClick={saveAcordo} loading={savingAcordo}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MiniKpi({ label, val, highlight }: { label: string; val: number; highlight?: boolean }) {
  return (
    <Card className="p-2">
      <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "var(--text3)" }}>{label}</div>
      <div className="text-sm font-bold font-mono" style={{ color: highlight ? "var(--accent)" : "var(--text)" }}>
        {formatCurrency(val || 0)}
      </div>
    </Card>
  );
}
