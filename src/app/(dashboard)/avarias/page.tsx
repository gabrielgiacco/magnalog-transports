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
  BarChart2, List, FileText, Package, TrendingUp, User, Filter, Upload, Square, CheckSquare, LogOut, DollarSign,
  ClipboardCheck, Printer,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { DiariasTab } from "./DiariasTab";
import { DeclaracaoSaidaTab } from "./DeclaracaoSaidaTab";

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

function maskCPF(v: string) {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Junta as NFs de uma avaria vindas das tres origens possiveis (FK direta,
 * notas da entrega e notas de devolucao) sem repetir. Mostra ate 3 e resume o
 * resto, porque uma avaria de devolucao pode ter uma dezena de notas.
 */
function resumoNFs(a: any): string {
  const numeros: string[] = [
    a.notaFiscal?.numero,
    ...(a.entrega?.notas || []).map((n: any) => n.numero),
    ...(a.devolucoes || []).map((d: any) => d.numero),
  ].filter(Boolean);

  const unicos = Array.from(new Set(numeros));
  if (unicos.length === 0) return "—";
  if (unicos.length <= 3) return `NF ${unicos.join(", ")}`;
  return `NF ${unicos.slice(0, 3).join(", ")} +${unicos.length - 3}`;
}

type TabView = "dashboard" | "registros" | "devolucoes" | "ocorrencias" | "diarias" | "declaracao" | "declaracao-saida";

export default function AvariasPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const [tab, setTab] = useState<TabView>("dashboard");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t && ["dashboard", "registros", "devolucoes", "ocorrencias", "diarias", "declaracao"].includes(t)) {
        setTab(t as TabView);
      }
    }
  }, []);

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
  const [searchDev, setSearchDev] = useState("");

  // Ocorrencias
  const [entregasOcorrencias, setEntregasOcorrencias] = useState<any[]>([]);
  const [loadingOcorrencias, setLoadingOcorrencias] = useState(false);
  const [searchOcorrencia, setSearchOcorrencia] = useState("");
  const [debouncedSearchOcorrencia, setDebouncedSearchOcorrencia] = useState("");

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvendoEntrega, setResolvendoEntrega] = useState<any>(null);
  const [resolucaoTexto, setResolucaoTexto] = useState("");
  const [statusFinalEntrega, setStatusFinalEntrega] = useState("FINALIZADO");
  const [salvandoResolucao, setSalvandoResolucao] = useState(false);

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

  // Declaração de Recebimento
  const [declaracoesList, setDeclaracoesList] = useState<any[]>([]);
  const [loadingDeclaracoes, setLoadingDeclaracoes] = useState(false);
  const [showDeclModal, setShowDeclModal] = useState(false);
  const [declStep, setDeclStep] = useState(1);
  const [declSavingPrint, setDeclSavingPrint] = useState(false);
  const [declEntregaSearch, setDeclEntregaSearch] = useState("");
  const [declEntregaResults, setDeclEntregaResults] = useState<any[]>([]);
  const [declEntregas, setDeclEntregas] = useState<any[]>([]);
  const [declProdutosPorNf, setDeclProdutosPorNf] = useState<Record<string, any[]>>({});
  const [declXmlNfs, setDeclXmlNfs] = useState<any[]>([]);
  const [declUploadingXml, setDeclUploadingXml] = useState(false);
  const [declLinhas, setDeclLinhas] = useState<Array<{ key: string; notaFiscalId: string; nfNumero: string; codigoProduto: string; descricao: string; ncm: string; unidade: string; quantidadeNF: number; valorUnitario: number; quantidadeAvaria: number; tipoDivergencia: string }>>([]);
  const [declDados, setDeclDados] = useState({ transportadora: "", motoristaNome: "", motoristaCpf: "", placa: "", observacoes: "" });
  const [declProdutoSearch, setDeclProdutoSearch] = useState("");

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchOcorrencia(searchOcorrencia), 400);
    return () => clearTimeout(t);
  }, [searchOcorrencia]);

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

  const fetchOcorrencias = useCallback(async () => {
    setLoadingOcorrencias(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearchOcorrencia) params.set("q", debouncedSearchOcorrencia);
      const res = await fetch(`/api/entregas/ocorrencias?${params}`);
      const data = await res.json();
      setEntregasOcorrencias(data.entregas || []);
    } catch {
      toast.error("Erro ao carregar ocorrências");
    } finally {
      setLoadingOcorrencias(false);
    }
  }, [debouncedSearchOcorrencia]);

  async function handleResolveOcorrencia() {
    if (!resolucaoTexto.trim()) {
      toast.error("Insira uma observação para a resolução");
      return;
    }
    setSalvandoResolucao(true);
    try {
      const ultimaOcorr = resolvendoEntrega.ocorrencias?.find((o: any) => !o.resolvida);
      if (!ultimaOcorr) {
        toast.error("Nenhuma ocorrência em aberto encontrada");
        return;
      }

      // 1. Atualizar a ocorrência
      const resOcorr = await fetch(`/api/entregas/${resolvendoEntrega.id}/ocorrencia`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocorrenciaId: ultimaOcorr.id,
          resolucao: resolucaoTexto
        })
      });

      if (!resOcorr.ok) throw new Error("Erro ao salvar resolução da ocorrência");

      // 2. Atualizar o status da entrega
      const resEntrega = await fetch(`/api/entregas/${resolvendoEntrega.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: statusFinalEntrega
        })
      });

      if (!resEntrega.ok) throw new Error("Erro ao atualizar status da entrega");

      toast.success("Ocorrência resolvida com sucesso!");
      setShowResolveModal(false);
      setResolucaoTexto("");
      setResolvendoEntrega(null);
      fetchOcorrencias();
      fetchResumo();
    } catch (error: any) {
      toast.error(error.message || "Erro ao resolver ocorrência");
    } finally {
      setSalvandoResolucao(false);
    }
  }

  useEffect(() => { fetchResumo(); fetch("/api/motoristas?ativo=true").then(r => r.json()).then(setMotoristas); }, []);
  useEffect(() => { if (tab === "registros") fetchAvarias(); }, [fetchAvarias, tab]);
  useEffect(() => { if (tab === "devolucoes") fetchDevolucoes(); }, [tab]);
  useEffect(() => { if (tab === "ocorrencias") fetchOcorrencias(); }, [tab, fetchOcorrencias]);

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

  const filteredDevGroups = devGroups.filter(g => {
    if (!searchDev.trim()) return true;
    const q = searchDev.toLowerCase().trim();
    if (g.avaria.codigo?.toLowerCase().includes(q)) return true;
    if (g.avaria.descricao?.toLowerCase().includes(q)) return true;
    return g.nfds.some((d: any) =>
      d.numero?.toLowerCase().includes(q) ||
      d.emitenteRazao?.toLowerCase().includes(q) ||
      d.emitenteCnpj?.includes(q) ||
      d.chaveAcesso?.includes(q)
    );
  });

  // Flat list of all NFDs across groups (for selection/bulk actions)
  const allDevolucoes = filteredDevGroups.flatMap(g => g.nfds);

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

  // ─── Declaração de Recebimento ─────────────────────────────────────────

  const fetchDeclaracoes = useCallback(async () => {
    setLoadingDeclaracoes(true);
    try {
      const res = await fetch("/api/avarias?fase=CONFERENCIA&limit=100", { cache: "no-store" });
      const data = await res.json();
      setDeclaracoesList(data.avarias || []);
    } catch { toast.error("Erro ao carregar declarações"); }
    finally { setLoadingDeclaracoes(false); }
  }, []);

  useEffect(() => { if (tab === "declaracao") fetchDeclaracoes(); }, [tab, fetchDeclaracoes]);

  // busca entregas para o modal de declaração
  useEffect(() => {
    if (!declEntregaSearch || declEntregaSearch.length < 2) { setDeclEntregaResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/entregas?cliente=${encodeURIComponent(declEntregaSearch)}&limit=10`);
      const data = await res.json();
      setDeclEntregaResults(data.entregas || []);
    }, 400);
    return () => clearTimeout(t);
  }, [declEntregaSearch]);

  async function selectDeclEntrega(e: any) {
    if (declEntregas.some((x) => x.id === e.id)) return;
    setDeclEntregas((prev) => [...prev, e]);
    setDeclEntregaSearch("");
    setDeclEntregaResults([]);

    // auto-preenche dados da entrega
    setDeclDados((d) => ({
      ...d,
      motoristaNome: d.motoristaNome || e.motorista?.nome || "",
      motoristaCpf: d.motoristaCpf || maskCPF(e.motorista?.cpf || ""),
      placa: d.placa || e.veiculo?.placa || "",
    }));

    // busca produtos de TODAS as NFs da entrega
    if (e.notas?.length > 0) {
      const map: Record<string, any[]> = {};
      await Promise.all(
        e.notas.map(async (nf: any) => {
          try {
            const res = await fetch(`/api/notas/${nf.id}/produtos`);
            const data = await res.json();
            map[nf.id] = data.produtos || [];
          } catch { map[nf.id] = []; }
        })
      );
      // mescla com o que já veio das outras entregas / XMLs
      setDeclProdutosPorNf((prev) => ({ ...prev, ...map }));
    }
  }

  // Remove uma entrega da declaração junto com as NFs e divergências dela.
  function removeDeclEntrega(entregaId: string) {
    const alvo = declEntregas.find((x) => x.id === entregaId);
    const nfIds: string[] = (alvo?.notas || []).map((n: any) => n.id);
    setDeclEntregas((prev) => prev.filter((x) => x.id !== entregaId));
    setDeclProdutosPorNf((prev) => {
      const next = { ...prev };
      nfIds.forEach((id) => delete next[id]);
      return next;
    });
    setDeclLinhas((prev) => prev.filter((l) => !nfIds.some((id) => l.key.startsWith(`${id}_`))));
  }

  function toggleDeclLinha(nfId: string, nfNumero: string, idx: number, prod: any) {
    const prefix = `${nfId}_${idx}_`;
    setDeclLinhas((prev) => {
      const exists = prev.some((l) => l.key.startsWith(prefix));
      if (exists) return prev.filter((l) => !l.key.startsWith(prefix));
      return [
        ...prev,
        {
          key: `${prefix}0`,
          notaFiscalId: nfId,
          nfNumero,
          codigoProduto: prod.codigoProduto,
          descricao: prod.descricao,
          ncm: prod.ncm || "",
          unidade: prod.unidade || "FARDOS",
          quantidadeNF: prod.quantidade,
          valorUnitario: prod.valorUnitario || 0,
          quantidadeAvaria: prod.quantidade,
          tipoDivergencia: "FALTA",
        },
      ];
    });
  }

  function updateDeclLinha(key: string, patch: Partial<{ quantidadeAvaria: number; tipoDivergencia: string }>) {
    setDeclLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function splitDeclLinha(nfId: string, nfNumero: string, idx: number, prod: any) {
    const prefix = `${nfId}_${idx}_`;
    setDeclLinhas((prev) => {
      const existentes = prev.filter((l) => l.key.startsWith(prefix));
      if (existentes.length === 0) return prev;
      const proxSub = Math.max(...existentes.map((l) => parseInt(l.key.split("_").pop() || "0"))) + 1;
      const somaAtual = existentes.reduce((s, l) => s + (l.quantidadeAvaria || 0), 0);
      const restante = Math.max(0, (prod.quantidade || 0) - somaAtual);
      const tiposUsados = new Set(existentes.map((l) => l.tipoDivergencia));
      const proxTipo = ["AVARIA", "SOBRA", "INVERSAO", "DEVOLUCAO", "SEM_PEDIDO", "FALTA"].find((t) => !tiposUsados.has(t)) || "AVARIA";
      return [
        ...prev,
        {
          key: `${prefix}${proxSub}`,
          notaFiscalId: nfId,
          nfNumero,
          codigoProduto: prod.codigoProduto,
          descricao: prod.descricao,
          ncm: prod.ncm || "",
          unidade: prod.unidade || "FARDOS",
          quantidadeNF: prod.quantidade,
          valorUnitario: prod.valorUnitario || 0,
          quantidadeAvaria: restante,
          tipoDivergencia: proxTipo,
        },
      ];
    });
  }

  function removeDeclLinhaSub(key: string) {
    setDeclLinhas((prev) => prev.filter((l) => l.key !== key));
  }

  function resetDeclForm() {
    setDeclStep(1);
    setDeclEntregas([]);
    setDeclEntregaSearch("");
    setDeclEntregaResults([]);
    setDeclProdutosPorNf({});
    setDeclLinhas([]);
    setDeclXmlNfs([]);
    setDeclDados({ transportadora: "", motoristaNome: "", motoristaCpf: "", placa: "", observacoes: "" });
    setDeclProdutoSearch("");
  }

  async function handleUploadDeclXml(files: FileList | null) {
    if (!files || files.length === 0) return;
    setDeclUploadingXml(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const res = await fetch("/api/declaracao/parse-xml", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar XML");

      const novasNfs = (data.notas || []).filter((n: any) => !declXmlNfs.some((x) => x.id === n.id));
      setDeclXmlNfs((prev) => [...prev, ...novasNfs]);
      setDeclProdutosPorNf((prev) => {
        const next = { ...prev };
        for (const nf of novasNfs) next[nf.id] = nf.produtos || [];
        return next;
      });
      // Auto-preenche transportadora com emitente da primeira NF, se vazia
      if (novasNfs[0]?.emitenteRazao) {
        setDeclDados((d) => ({ ...d, transportadora: d.transportadora || novasNfs[0].emitenteRazao }));
      }
      if (data.erros?.length) toast.error(`${data.erros.length} arquivo(s) com erro`);
      if (novasNfs.length > 0) toast.success(`${novasNfs.length} NF(s) importada(s) do XML`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeclUploadingXml(false);
    }
  }

  function removeDeclXmlNf(nfId: string) {
    setDeclXmlNfs((prev) => prev.filter((n) => n.id !== nfId));
    setDeclProdutosPorNf((prev) => {
      const { [nfId]: _, ...rest } = prev;
      return rest;
    });
    // Remove linhas selecionadas dessa NF
    setDeclLinhas((prev) => prev.filter((l) => !l.key.startsWith(`${nfId}_`)));
  }

  async function handleSalvarEImprimirDeclaracao() {
    if (declLinhas.length === 0) { toast.error("Selecione ao menos um produto com divergência"); return; }
    // tipo mais frequente entre as linhas → tipo da Avaria pai
    const counts = declLinhas.reduce((acc: Record<string, number>, l) => {
      acc[l.tipoDivergencia] = (acc[l.tipoDivergencia] || 0) + 1;
      return acc;
    }, {});
    const tipoPrincipal = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    setDeclSavingPrint(true);
    try {
      const body = {
        tipo: tipoPrincipal,
        fase: "CONFERENCIA",
        dataOcorrencia: new Date().toISOString().slice(0, 10),
        localOcorrencia: "Aparecida de Goiânia",
        descricao: `Declaração de Recebimento — ${declEntregas.length > 1
          ? `${declEntregas[0].razaoSocial} e mais ${declEntregas.length - 1} entrega(s)`
          : declEntregas[0]?.razaoSocial || declXmlNfs[0]?.emitenteRazao || "Devolução avulsa"}`,
        observacoes: declDados.observacoes || null,
        // Avaria tem um único entregaId: guarda a primeira como principal. O
        // vínculo real de cada linha vai em produtos[].notaFiscalId.
        entregaId: declEntregas[0]?.id || null,
        motoristaId: declEntregas[0]?.motorista?.id || null,
        transportadoraChegada: declDados.transportadora || null,
        motoristaChegada: declDados.motoristaNome || null,
        motoristaCpfChegada: declDados.motoristaCpf || null,
        placaChegada: declDados.placa || null,
        dataChegada: new Date().toISOString(),
        produtos: declLinhas.map((l) => ({
          codigoProduto: l.codigoProduto,
          descricao: l.descricao,
          ncm: l.ncm || null,
          unidade: l.unidade || null,
          quantidadeNF: l.quantidadeNF,
          quantidadeAvaria: l.quantidadeAvaria,
          valorUnitario: l.valorUnitario,
          notaFiscalId: l.notaFiscalId,
          tipoDivergencia: l.tipoDivergencia,
        })),
      };
      const res = await fetch("/api/avarias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao salvar");
      const created = await res.json();
      toast.success(`Declaração ${created.codigo} criada!`);
      window.open(`/imprimir/declaracao-recebimento/${created.id}`, "_blank");
      setShowDeclModal(false);
      resetDeclForm();
      fetchDeclaracoes();
      fetchResumo();
      fetchAvarias();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar declaração");
    } finally {
      setDeclSavingPrint(false);
    }
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
      <Topbar title="Avarias e Ocorrências" subtitle="Controle de mercadorias com ocorrência"
        actions={<Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}><Plus size={14} /> <span className="hidden sm:inline">Nova Avaria</span><span className="sm:hidden">Nova</span></Button>} />

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl w-full sm:w-fit" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
          {([
            { key: "dashboard", label: "Dashboard", icon: BarChart2 },
            { key: "registros", label: "Registros", icon: List },
            { key: "devolucoes", label: "Devoluções", icon: FileText },
            { key: "ocorrencias", label: "Ocorrências", icon: AlertTriangle },
            { key: "diarias", label: "Diárias", icon: DollarSign },
            { key: "declaracao", label: "Declaração Recebimento", icon: ClipboardCheck },
            { key: "declaracao-saida", label: "Declaração Saída", icon: LogOut },
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
                            <div className="text-xs">{resumoNFs(a)}</div>
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

          {/* Barra de Pesquisa de Devoluções */}
          <Card className="p-3 sm:p-4">
            <div className="relative w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
              <input value={searchDev} onChange={e => setSearchDev(e.target.value)}
                placeholder="Buscar por NF de devolução, código de avaria, emitente ou CNPJ..."
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </div>
          </Card>

          {loadingDev ? <Loading /> : filteredDevGroups.length === 0 ? <Empty icon="📦" text="Nenhuma devolução encontrada" /> : (
            <div className="space-y-3">
              {filteredDevGroups.map(group => {
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

        {/* OCORRÊNCIAS TAB */}
        {tab === "ocorrencias" && (
          <>
            <Card className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
                  <input value={searchOcorrencia} onChange={e => setSearchOcorrencia(e.target.value)}
                    placeholder="Buscar por NF, código de entrega, cliente, motorista..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
                <Button variant="ghost" size="sm" onClick={fetchOcorrencias} className="flex-shrink-0">
                  <RefreshCw size={13} /> Atualizar
                </Button>
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              {loadingOcorrencias ? <Loading /> : entregasOcorrencias.length === 0 ? <Empty icon="⚠️" text="Nenhuma entrega com ocorrência registrada" /> : (
                <>
                  {/* Mobile list */}
                  <div className="block md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
                    {entregasOcorrencias.map(e => {
                      const ultimaOcorr = e.ocorrencias && e.ocorrencias[0];
                      const isFalha = e.codigo?.endsWith(" (FALHA)") || (e.observacoes && e.observacoes.includes("Tentativa Falha das NFs:"));
                      const resolvido = ultimaOcorr ? ultimaOcorr.resolvida : true;
                      
                      // Extrair notas se existirem ou de observacoes
                      let nfsExibicao = "";
                      if (e.notas && e.notas.length > 0) {
                        nfsExibicao = e.notas.map((n: any) => `NF ${n.numero}`).join(", ");
                      } else if (e.observacoes && e.observacoes.includes("Tentativa Falha das NFs:")) {
                        const match = e.observacoes.match(/Tentativa Falha das NFs:\s*([^\n\r]+)/);
                        if (match && match[1]) {
                          nfsExibicao = `NF ${match[1].trim()} (Falha anterior)`;
                        }
                      }
                      if (!nfsExibicao) nfsExibicao = e.codigo;

                      return (
                        <div key={e.id} className="p-3 hover:bg-[#1e293b]/50 transition-colors" style={{ borderBottom: "1px solid var(--border)" }}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{nfsExibicao}</span>
                                {isFalha && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/30">
                                    Reentrega Gerada
                                  </span>
                                )}
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${resolvido ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30" : "bg-orange-500/10 text-orange-500 border border-orange-500/30"}`}>
                                  {resolvido ? "Solucionada" : "Pendente"}
                                </span>
                              </div>
                              <div className="text-xs font-semibold truncate">{e.razaoSocial}</div>
                            </div>
                            <button className="p-1 rounded hover:bg-[var(--surface2)]" onClick={() => router.push(`/entregas/${e.id}`)}>
                              <Eye size={14} style={{ color: "var(--text2)" }} />
                            </button>
                          </div>
                          
                          {ultimaOcorr && (
                            <div className="mb-2 p-2 rounded bg-[var(--surface2)] text-xs border border-[var(--border)]">
                              <div className="flex justify-between font-semibold mb-1 text-[10px]" style={{ color: "var(--text2)" }}>
                                <span>Ocorrência: {ultimaOcorr.tipo}</span>
                                <span className="font-mono">{formatDate(ultimaOcorr.createdAt)}</span>
                              </div>
                              <p style={{ color: "var(--text2)" }}>{ultimaOcorr.descricao}</p>
                              {ultimaOcorr.resolucao && (
                                <div className="mt-1.5 pt-1.5 border-t border-[var(--border)] text-[11px] text-emerald-600">
                                  <strong>Resolução:</strong> {ultimaOcorr.resolucao}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text3)" }}>
                            <span>{e.cidade} · {e.motorista?.nome || "Sem motorista"}</span>
                            {!resolvido && (
                              <Button size="sm" onClick={() => { setResolvendoEntrega(e); setResolucaoTexto(""); setStatusFinalEntrega("FINALIZADO"); setShowResolveModal(true); }}>
                                Resolver
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <Table>
                      <thead>
                        <tr>
                          <Th>NFs / Código</Th>
                          <Th>Cliente</Th>
                          <Th>Cidade / UF</Th>
                          <Th>Motorista</Th>
                          <Th>Última Ocorrência</Th>
                          <Th>Status</Th>
                          <Th>Observação / Resolução</Th>
                          <Th></Th>
                        </tr>
                      </thead>
                      <tbody>
                        {entregasOcorrencias.map(e => {
                          const ultimaOcorr = e.ocorrencias && e.ocorrencias[0];
                          const isFalha = e.codigo?.endsWith(" (FALHA)") || (e.observacoes && e.observacoes.includes("Tentativa Falha das NFs:"));
                          const resolvido = ultimaOcorr ? ultimaOcorr.resolvida : true;
                          
                          // Extrair notas se existirem ou de observacoes
                          let nfsExibicao = "";
                          if (e.notas && e.notas.length > 0) {
                            nfsExibicao = e.notas.map((n: any) => `NF ${n.numero}`).join(", ");
                          } else if (e.observacoes && e.observacoes.includes("Tentativa Falha das NFs:")) {
                            const match = e.observacoes.match(/Tentativa Falha das NFs:\s*([^\n\r]+)/);
                            if (match && match[1]) {
                              nfsExibicao = `NF ${match[1].trim()} (Falha)`;
                            }
                          }
                          if (!nfsExibicao) nfsExibicao = e.codigo;

                          return (
                            <Tr key={e.id}>
                              <Td>
                                <div className="font-mono text-xs font-bold leading-tight" style={{ color: "var(--accent)" }}>{nfsExibicao}</div>
                                {isFalha && (
                                  <div className="mt-1">
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/30">
                                      Reentrega Gerada
                                    </span>
                                  </div>
                                )}
                              </Td>
                              <Td>
                                <div className="text-xs font-semibold">{e.razaoSocial}</div>
                                <div className="text-[9px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(e.cnpj)}</div>
                              </Td>
                              <Td><span className="text-xs" style={{ color: "var(--text2)" }}>{e.cidade}{e.uf ? ` — ${e.uf}` : ""}</span></Td>
                              <Td><span className="text-xs" style={{ color: "var(--text2)" }}>{e.motorista?.nome || "—"}</span></Td>
                              <Td>
                                {ultimaOcorr ? (
                                  <div className="max-w-xs">
                                    <div className="text-[10px] font-bold text-red-500">{ultimaOcorr.tipo}</div>
                                    <div className="text-xs text-slate-500 truncate" title={ultimaOcorr.descricao}>{ultimaOcorr.descricao}</div>
                                    <div className="text-[9px] text-slate-400 font-mono">{formatDate(ultimaOcorr.createdAt)}</div>
                                  </div>
                                ) : "—"}
                              </Td>
                              <Td>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${resolvido ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30" : "bg-orange-500/10 text-orange-500 border border-orange-500/30"}`}>
                                  {resolvido ? "Solucionada" : "Pendente"}
                                </span>
                              </Td>
                              <Td>
                                {ultimaOcorr?.resolucao ? (
                                  <span className="text-xs text-emerald-600 font-medium">{ultimaOcorr.resolucao}</span>
                                ) : (
                                  <span className="text-xs italic" style={{ color: "var(--text3)" }}>—</span>
                                )}
                              </Td>
                              <Td>
                                <div className="flex items-center gap-1.5">
                                  {!resolvido && (
                                    <Button size="sm" onClick={() => { setResolvendoEntrega(e); setResolucaoTexto(""); setStatusFinalEntrega("FINALIZADO"); setShowResolveModal(true); }}>
                                      Resolver
                                    </Button>
                                  )}
                                  <button className="p-1.5 rounded-lg hover:opacity-70 transition-all" style={{ background: "var(--surface2)", color: "var(--text2)" }}
                                    onClick={() => router.push(`/entregas/${e.id}`)}>
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
                </>
              )}
            </Card>
          </>
        )}

        {/* DIARIAS TAB */}
        {tab === "diarias" && <DiariasTab isAdmin={isAdmin} />}

        {tab === "declaracao-saida" && <DeclaracaoSaidaTab />}

        {/* DECLARAÇÃO DE RECEBIMENTO TAB */}
        {tab === "declaracao" && (
          <>
            <Card className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="flex items-start gap-3">
                  <ClipboardCheck size={20} className="text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold">Declaração de Recebimento</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text2)" }}>
                      Emita declarações formais quando a conferência de uma carga acusar divergência (falta, sobra, avaria, inversão).
                    </div>
                  </div>
                </div>
                <Button onClick={() => { resetDeclForm(); setShowDeclModal(true); }}>
                  <Plus size={14} /> Nova Declaração
                </Button>
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              {loadingDeclaracoes ? (
                <Loading />
              ) : declaracoesList.length === 0 ? (
                <Empty icon="📄" text="Nenhuma declaração ainda. Clique em Nova Declaração pra emitir a primeira." />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Código</Th>
                      <Th>Data</Th>
                      <Th>Cliente / Entrega</Th>
                      <Th>Motorista</Th>
                      <Th>Transportadora</Th>
                      <Th>Produtos</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {declaracoesList.map((d) => (
                      <Tr key={d.id}>
                        <Td><span className="font-mono text-xs font-semibold" style={{ color: "var(--accent)" }}>{d.codigo}</span></Td>
                        <Td><span className="text-xs font-mono" style={{ color: "var(--text2)" }}>{formatDate(d.dataOcorrencia)}</span></Td>
                        <Td>
                          <div className="text-sm">
                            {d.entrega?.razaoSocial
                              || (d.descricao || "").replace(/^Declaração de Recebimento — /, "")
                              || "—"}
                          </div>
                          <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                            {d.entrega?.codigo || ""} {d.entrega?.cidade ? `· ${d.entrega.cidade}` : ""}
                          </div>
                        </Td>
                        <Td><span className="text-xs">{d.motoristaChegada || d.motorista?.nome || "—"}</span></Td>
                        <Td><span className="text-xs">{d.transportadoraChegada || "—"}</span></Td>
                        <Td><span className="text-xs font-mono">{d._count?.produtos || 0}</span></Td>
                        <Td>
                          <button
                            onClick={() => window.open(`/imprimir/declaracao-recebimento/${d.id}`, "_blank")}
                            className="p-1.5 rounded-lg hover:opacity-70 transition-all inline-flex items-center gap-1"
                            style={{ background: "var(--surface2)", color: "var(--text2)" }}
                            title="Reimprimir declaração"
                          >
                            <Printer size={13} /> <span className="text-xs">Imprimir</span>
                          </button>
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

      {/* RESOLVE OCORRENCIA MODAL */}
      <Modal open={showResolveModal} onClose={() => { setShowResolveModal(false); setResolvendoEntrega(null); }} title="Resolver Ocorrência" size="md">
        <div className="space-y-4">
          <div className="p-3 rounded-xl flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
            <AlertTriangle size={18} className="flex-shrink-0" />
            <p className="text-sm">
              Ao solucionar a ocorrência, defina o status final e registre as observações da resolução (se gerou reentrega, se foi devolvida, etc.).
            </p>
          </div>

          {resolvendoEntrega && (
            <div className="p-3 rounded-lg text-xs space-y-1" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <div className="font-semibold text-[10px] uppercase tracking-wider text-slate-400">Dados da Entrega</div>
              <div>Cliente: <strong>{resolvendoEntrega.razaoSocial}</strong></div>
              {resolvendoEntrega.ocorrencias?.[0] && (
                <div>Ocorrência Atual: <strong>{resolvendoEntrega.ocorrencias[0].tipo}</strong> - {resolvendoEntrega.ocorrencias[0].descricao}</div>
              )}
            </div>
          )}

          <Select label="Status Final da Entrega" value={statusFinalEntrega} onChange={e => setStatusFinalEntrega(e.target.value)}>
            <option value="FINALIZADO">Finalizado (Cobrança normal / Reentrega faturada)</option>
            <option value="ENTREGUE">Entregue (Resolvido com o cliente no local)</option>
            <option value="EM_ROTA">Em Rota (Retomar viagem)</option>
          </Select>

          <Textarea label="Observação da Resolução / Ocorrência Solucionada *" rows={3} value={resolucaoTexto} onChange={e => setResolucaoTexto(e.target.value)}
            placeholder="Ex: Gerou reentrega sob NF 12345 / Devolvido ao cliente por recusa / Aguardando redespacho..." />

          <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <Button variant="ghost" onClick={() => { setShowResolveModal(false); setResolvendoEntrega(null); }}>Cancelar</Button>
            <Button onClick={handleResolveOcorrencia} loading={salvandoResolucao}>Confirmar Resolução</Button>
          </div>
        </div>
      </Modal>

      {/* DECLARAÇÃO DE RECEBIMENTO MODAL */}
      <Modal open={showDeclModal} onClose={() => { setShowDeclModal(false); resetDeclForm(); }} title={`Nova Declaração de Recebimento — Etapa ${declStep}/3`} size="xl">
        {/* STEP 1: Selecionar entrega */}
        {declStep === 1 && (
          <div className="space-y-4">
            <p className="text-xs" style={{ color: "var(--text2)" }}>
              Busque as entregas recebidas no armazém. Pode adicionar quantas precisar — a declaração lista os produtos de todas as NFs juntas.
            </p>

            {declEntregas.length > 0 && (
              <div className="space-y-1">
                {declEntregas.map((ent: any) => (
                  <div key={ent.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{ent.razaoSocial}</div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                        {ent.codigo} · {ent.cidade} · {ent.notas?.length || 0} NF(s) · {ent.motorista?.nome || "sem motorista"}
                      </div>
                    </div>
                    <button onClick={() => removeDeclEntrega(ent.id)} title="Remover esta entrega"
                      className="px-2 py-0.5 rounded text-base leading-none hover:opacity-70"
                      style={{ color: "var(--text3)" }}>×</button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative">
              <input
                value={declEntregaSearch}
                onChange={(e) => setDeclEntregaSearch(e.target.value)}
                placeholder={declEntregas.length > 0 ? "Adicionar outra entrega..." : "Buscar por NF, cliente ou código..."}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              {declEntregaResults.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full rounded-lg shadow-xl max-h-64 overflow-y-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  {declEntregaResults.map((e: any) => {
                    const jaAdicionada = declEntregas.some((x: any) => x.id === e.id);
                    return (
                      <div key={e.id} onClick={() => { if (!jaAdicionada) selectDeclEntrega(e); }}
                        className={`px-3 py-2 transition-colors ${jaAdicionada ? "opacity-50 cursor-default" : "cursor-pointer hover:bg-[var(--surface2)]"}`}
                        style={{ borderBottom: "1px solid var(--border)" }}>
                        <div className="text-sm font-semibold">{e.razaoSocial}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                          {e.codigo} · {e.cidade} · {e.notas?.length || 0} NF(s) · {e.motorista?.nome || "sem motorista"}
                          {jaAdicionada && <span style={{ color: "var(--accent)" }}> · já adicionada</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* OU importar XML de devolução (sem entrega vinculada) */}
            <div className="pt-3" style={{ borderTop: "1px dashed var(--border)" }}>
              <div className="text-[11px] font-mono uppercase mb-2" style={{ color: "var(--text3)" }}>
                Ou importar XML — caso seja devolução (sem entrega no sistema)
              </div>
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm"
                style={{ background: "var(--surface2)", border: "1px dashed var(--border)", color: "var(--text2)" }}>
                <Upload size={14} />
                <span>{declUploadingXml ? "Importando…" : "Selecionar XML(s) de NF-e"}</span>
                <input type="file" accept=".xml" multiple hidden
                  disabled={declUploadingXml}
                  onChange={(e) => { handleUploadDeclXml(e.target.files); e.target.value = ""; }} />
              </label>

              {declXmlNfs.length > 0 && (
                <div className="mt-3 space-y-1">
                  {declXmlNfs.map((nf) => (
                    <div key={nf.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                      style={{ background: "rgba(249,115,22,.06)", border: "1px solid rgba(249,115,22,.25)" }}>
                      <FileText size={13} style={{ color: "var(--accent)" }} />
                      <div className="flex-1">
                        <div className="font-mono font-bold">NF {nf.numero}</div>
                        <div className="text-[10px]" style={{ color: "var(--text3)" }}>
                          {nf.emitenteRazao} · {declProdutosPorNf[nf.id]?.length || 0} produto(s)
                        </div>
                      </div>
                      <button onClick={() => removeDeclXmlNf(nf.id)} title="Remover NF"
                        style={{ color: "var(--text3)" }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => { setShowDeclModal(false); resetDeclForm(); }}>Cancelar</Button>
              <Button onClick={() => setDeclStep(2)} disabled={declEntregas.length === 0 && declXmlNfs.length === 0}>Próximo</Button>
            </div>
          </div>
        )}

        {/* STEP 2: Marcar produtos com divergência */}
        {declStep === 2 && (
          <div className="space-y-4">
            <p className="text-xs" style={{ color: "var(--text2)" }}>
              Marque os produtos com divergência. Cada linha tem seu próprio tipo (Falta / Sobra / Avaria / Inversão / Outro) e a quantidade divergente.
            </p>

            {/* Busca produto */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
              <input
                value={declProdutoSearch}
                onChange={(e) => setDeclProdutoSearch(e.target.value)}
                placeholder="Buscar produto por código ou nome..."
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              {declProdutoSearch && (
                <button
                  onClick={() => setDeclProdutoSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:opacity-70 transition-all"
                  style={{ color: "var(--text3)" }}
                  title="Limpar busca"
                >
                  ×
                </button>
              )}
            </div>

            {Object.keys(declProdutosPorNf).length === 0 ? (
              <div className="text-center py-8 text-xs" style={{ color: "var(--text3)" }}>
                Nenhum produto disponível (XML pode não estar armazenado nas NFs).
              </div>
            ) : (() => {
              const q = declProdutoSearch.trim().toLowerCase();
              const notasDoModal: any[] = [
                ...declEntregas.flatMap((ent: any) => ent.notas || []),
                ...declXmlNfs,
              ];
              const cardsRenderizados = notasDoModal.map((nf: any) => {
                const produtos = declProdutosPorNf[nf.id] || [];
                if (produtos.length === 0) return null;
                const produtosFiltrados = q
                  ? produtos
                      .map((p: any, idx: number) => ({ p, idx }))
                      .filter(({ p, idx }: any) => {
                        const alreadySel = declLinhas.some((l) => l.key.startsWith(`${nf.id}_${idx}_`));
                        return alreadySel ||
                          String(p.codigoProduto || "").toLowerCase().includes(q) ||
                          String(p.descricao || "").toLowerCase().includes(q);
                      })
                  : produtos.map((p: any, idx: number) => ({ p, idx }));
                if (produtosFiltrados.length === 0) return null;
                return (
                  <div key={nf.id} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                    <div className="px-3 py-2 text-xs font-mono font-bold flex items-center justify-between" style={{ background: "var(--surface2)", color: "var(--accent)" }}>
                      <div>NF {nf.numero} <span style={{ color: "var(--text3)" }}>· {nf.emitenteRazao}</span></div>
                      {q && <span className="text-[10px]" style={{ color: "var(--text3)" }}>{produtosFiltrados.length} de {produtos.length}</span>}
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "var(--surface2)" }}>
                          <th className="px-2 py-1.5 text-left w-8"></th>
                          <th className="px-2 py-1.5 text-left text-[9px] font-bold uppercase" style={{ color: "var(--text3)" }}>Produto</th>
                          <th className="px-2 py-1.5 text-right text-[9px] font-bold uppercase" style={{ color: "var(--text3)" }}>Qtd NF</th>
                          <th className="px-2 py-1.5 text-right text-[9px] font-bold uppercase" style={{ color: "var(--text3)" }}>Qtd Diverg.</th>
                          <th className="px-2 py-1.5 text-left text-[9px] font-bold uppercase" style={{ color: "var(--text3)" }}>Tipo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {produtosFiltrados.flatMap(({ p, idx }: any) => {
                          const prefix = `${nf.id}_${idx}_`;
                          const sublinhas = declLinhas.filter((l) => l.key.startsWith(prefix));
                          const sel = sublinhas.length > 0;
                          const somaSublinhas = sublinhas.reduce((s, l) => s + (l.quantidadeAvaria || 0), 0);
                          const excedeu = somaSublinhas > (p.quantidade || 0);

                          if (!sel) {
                            return [(
                              <tr key={`${idx}_head`} style={{ borderTop: "1px solid var(--border)" }}>
                                <td className="px-2 py-1.5">
                                  <input type="checkbox" checked={false}
                                    onChange={() => toggleDeclLinha(nf.id, nf.numero, idx, p)}
                                    className="accent-orange-500 w-4 h-4" />
                                </td>
                                <td className="px-2 py-1.5">
                                  <div className="font-medium">{p.descricao}</div>
                                  <div className="text-[9px] font-mono" style={{ color: "var(--text3)" }}>Cód: {p.codigoProduto}</div>
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono">{p.quantidade}</td>
                                <td className="px-2 py-1.5 text-right"><span style={{ color: "var(--text3)" }}>—</span></td>
                                <td className="px-2 py-1.5"><span className="text-[10px]" style={{ color: "var(--text3)" }}>—</span></td>
                              </tr>
                            )];
                          }

                          return sublinhas.map((linha, subIdx) => {
                            const isFirst = subIdx === 0;
                            const isLast = subIdx === sublinhas.length - 1;
                            return (
                              <tr key={linha.key}
                                className="bg-orange-500/10 transition-colors"
                                style={{ borderTop: "1px solid var(--border)" }}>
                                <td className="px-2 py-1.5">
                                  {isFirst ? (
                                    <input type="checkbox" checked={true}
                                      onChange={() => toggleDeclLinha(nf.id, nf.numero, idx, p)}
                                      className="accent-orange-500 w-4 h-4" title="Desmarcar produto (remove todas as divergências)" />
                                  ) : (
                                    <button onClick={() => removeDeclLinhaSub(linha.key)}
                                      title="Remover esta linha de divergência"
                                      className="w-4 h-4 flex items-center justify-center rounded hover:opacity-70"
                                      style={{ color: "var(--text3)" }}>×</button>
                                  )}
                                </td>
                                <td className="px-2 py-1.5">
                                  {isFirst ? (
                                    <>
                                      <div className="font-medium">{p.descricao}</div>
                                      <div className="text-[9px] font-mono" style={{ color: "var(--text3)" }}>
                                        Cód: {p.codigoProduto}
                                        {sublinhas.length > 1 && (
                                          <span style={{ color: excedeu ? "#ef4444" : "var(--accent)", marginLeft: 8 }}>
                                            · {sublinhas.length} tipos ({somaSublinhas}/{p.quantidade}{excedeu ? " ⚠ excede" : ""})
                                          </span>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-[10px] font-mono pl-4" style={{ color: "var(--text3)" }}>
                                      ↳ divisão
                                    </div>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono">{isFirst ? p.quantidade : ""}</td>
                                <td className="px-2 py-1.5 text-right">
                                  <input type="number" min={0} step="any"
                                    value={linha.quantidadeAvaria}
                                    onChange={(e) => updateDeclLinha(linha.key, { quantidadeAvaria: parseFloat(e.target.value) || 0 })}
                                    className="w-20 px-2 py-1 rounded text-right font-mono text-xs outline-none"
                                    style={{ background: "var(--surface)", border: `1px solid ${excedeu ? "#ef4444" : "var(--border)"}`, color: "var(--text)" }} />
                                </td>
                                <td className="px-2 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <select value={linha.tipoDivergencia}
                                      onChange={(e) => updateDeclLinha(linha.key, { tipoDivergencia: e.target.value })}
                                      className="px-2 py-1 rounded text-xs outline-none"
                                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
                                      {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                    {isLast && (
                                      <button onClick={() => splitDeclLinha(nf.id, nf.numero, idx, p)}
                                        title="Dividir em outro tipo (ex: 1 avaria + resto devolução)"
                                        className="px-2 py-1 rounded text-[10px] font-bold hover:opacity-80"
                                        style={{ background: "var(--surface2)", border: "1px dashed var(--accent)", color: "var(--accent)" }}>
                                        + dividir
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              });
              const algumCard = (cardsRenderizados || []).some((c: any) => c !== null);
              if (!algumCard && q) {
                return (
                  <div className="text-center py-8 text-xs" style={{ color: "var(--text3)" }}>
                    Nenhum produto encontrado para "<b>{declProdutoSearch}</b>".
                  </div>
                );
              }
              return <>{cardsRenderizados}</>;
            })()}

            <div className="text-xs" style={{ color: "var(--text2)" }}>
              <b>{new Set(declLinhas.map((l) => l.key.split("_").slice(0, 2).join("_"))).size}</b> produto(s) marcado(s) — <b>{declLinhas.length}</b> linha(s) de divergência
            </div>

            <div className="flex justify-end gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => setDeclStep(1)}>Voltar</Button>
              <Button onClick={() => setDeclStep(3)} disabled={declLinhas.length === 0}>Próximo</Button>
            </div>
          </div>
        )}

        {/* STEP 3: Dados adicionais + salvar+imprimir */}
        {declStep === 3 && (
          <div className="space-y-4">
            <p className="text-xs" style={{ color: "var(--text2)" }}>
              Confira os dados que vão no cabeçalho do documento. Placas podem ser combinadas (ex: <span className="font-mono">JBR0D80 / TKY6A14</span>).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Transportadora" value={declDados.transportadora}
                onChange={(e) => setDeclDados((d) => ({ ...d, transportadora: e.target.value }))}
                placeholder="Ex: PORTO LOG E TRANSP LTDA" />
              <Input label="Motorista" value={declDados.motoristaNome}
                onChange={(e) => setDeclDados((d) => ({ ...d, motoristaNome: e.target.value }))}
                placeholder="Nome completo" />
              <Input label="CPF" value={declDados.motoristaCpf} maxLength={14} inputMode="numeric"
                onChange={(e) => setDeclDados((d) => ({ ...d, motoristaCpf: maskCPF(e.target.value) }))}
                placeholder="000.000.000-00" />
              <Input label="Placa(s)" value={declDados.placa}
                onChange={(e) => setDeclDados((d) => ({ ...d, placa: e.target.value.toUpperCase() }))}
                placeholder="ABC1D23 / XYZ2E34" />
            </div>

            <Textarea label="Observações" rows={3} value={declDados.observacoes}
              onChange={(e) => setDeclDados((d) => ({ ...d, observacoes: e.target.value }))}
              placeholder="Ex: VEÍCULO CHEGOU LACRADO!" />

            <div className="p-3 rounded-lg text-xs" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)" }}>
              <b>Resumo:</b> {declLinhas.length} produto(s) com divergência de {new Set(declLinhas.map((l) => l.tipoDivergencia)).size} tipo(s) distinto(s).
              Ao confirmar, a declaração é salva como Avaria (fase Conferência) e a página de impressão abre em nova aba.
            </div>

            <div className="flex justify-end gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => setDeclStep(2)}>Voltar</Button>
              <Button onClick={handleSalvarEImprimirDeclaracao} loading={declSavingPrint}>
                <Printer size={14} /> Salvar e Imprimir
              </Button>
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
