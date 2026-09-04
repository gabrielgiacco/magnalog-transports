"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, StatusBadge, Modal, Input, Select, Textarea, ComboboxMotorista, Table, Th, Td, Tr } from "@/components/ui";
import { formatCurrency, formatDate, formatWeight, formatCNPJ } from "@/lib/utils";
import { Copy, FileText, History, Package, MapPin, Truck, ChevronLeft, Calendar, User, Clock, CheckCircle2, AlertCircle, Trash2, ShieldCheck, DollarSign, Scissors, ChevronDown, ChevronUp, Box, Info, Weight, Layers, AlertTriangle, Printer, Maximize2, Minimize2, Plus, Search, ExternalLink, Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { QualityScoring } from "@/components/quality/QualityScoring";
import { DanfeViewer } from "@/components/danfe/DanfeViewer";
import { parseDanfeXML } from "@/lib/danfe-parser";
import { baixarDanfeOficial, ROTULO_FORMATO, type FormatoDanfe } from "@/lib/danfe-pdf";
import { QUALIDADE_ENABLED } from "@/lib/features";
import { AnexosCard } from "@/components/entrega/AnexosCard";
import { LinkMotoristaModal } from "@/components/entrega/LinkMotoristaModal";
import { AvisoEntregaModal } from "@/components/entrega/AvisoEntregaModal";
import { SugestaoVeiculoModal } from "@/components/entrega/SugestaoVeiculoModal";
import { TicketModal } from "@/components/entrega/TicketModal";
import { Smartphone, Receipt, MessageCircle } from "lucide-react";

const STATUS_FLOW = [
  { key: "PROGRAMADO", label: "Programado", icon: "📋" },
  { key: "EM_SEPARACAO", label: "Em Separação", icon: "📦" },
  { key: "CARREGADO", label: "Carregado", icon: "🔄" },
  { key: "EM_ROTA", label: "Em Rota", icon: "🚛" },
  { key: "ENTREGUE", label: "Entregue", icon: "✅" },
  { key: "FINALIZADO", label: "Finalizado", icon: "🏁" },
];

export default function EntregaDetailPage() {
  const params = useParams()!;
  const id = params!.id as string;
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const isAdmin = userRole === "ADMIN";
  const isReadOnly = userRole === "CONFERENTE";

  const [entrega, setEntrega] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showComplFields, setShowComplFields] = useState(false);
  const [showOcorrencia, setShowOcorrencia] = useState(false);
  const [showDiaria, setShowDiaria] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [diariaForm, setDiariaForm] = useState({ motivo: "", valor: "", observacoes: "" });
  const [savingDiaria, setSavingDiaria] = useState(false);
  const [motoristas, setMotoristas] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [editForm, setEditForm] = useState<any>({});
  const [ocorrForm, setOcorrForm] = useState({ tipo: "ATRASO", descricao: "" });
  const [tab, setTab] = useState("info");
  const [showLinkMotorista, setShowLinkMotorista] = useState(false);
  const [showAvisoEntrega, setShowAvisoEntrega] = useState(false);
  const [avisoPendente, setAvisoPendente] = useState(false);
  const [showSugestao, setShowSugestao] = useState(false);
  const [selectedNotas, setSelectedNotas] = useState<string[]>([]);
  const [separando, setSeparando] = useState(false);
  const [danfeModal, setDanfeModal] = useState<{ open: boolean; xml: string | null; loading: boolean; fullscreen: boolean }>({ open: false, xml: null, loading: false, fullscreen: false });
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [formatoDanfe, setFormatoDanfe] = useState<FormatoDanfe>("completo");
  const [showQualityPrompt, setShowQualityPrompt] = useState(false);

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolucaoTexto, setResolucaoTexto] = useState("");
  const [statusFinalEntrega, setStatusFinalEntrega] = useState("FINALIZADO");
  const [devolucaoData, setDevolucaoData] = useState({
    transportadora: "",
    motorista: "",
    placa: "",
    dataCarregamento: "",
  });
  const [salvandoResolucao, setSalvandoResolucao] = useState(false);

  // Prompt de dataEntrega ao finalizar entrega que ainda não tem data
  const [showDataEntregaPrompt, setShowDataEntregaPrompt] = useState(false);
  const [dataEntregaInput, setDataEntregaInput] = useState("");
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingContext, setPendingContext] = useState<"status" | "resolve">("status");

  // Add NFs modal
  const [showAddNF, setShowAddNF] = useState(false);
  const [notasDisp, setNotasDisp] = useState<any[]>([]);
  const [selectedNFIds, setSelectedNFIds] = useState<string[]>([]);
  const [searchNF, setSearchNF] = useState("");
  const [addingNFs, setAddingNFs] = useState(false);

  async function reloadEntrega() {
    const d = await fetch(`/api/entregas/${id}`).then((r) => r.json());
    setEntrega(d);
    setEditForm(formatForEdit(d));
  }

  useEffect(() => {
    reloadEntrega().finally(() => setLoading(false));
    fetch("/api/motoristas?ativo=true").then((r) => r.json()).then(setMotoristas);
    fetch("/api/veiculos").then((r) => r.json()).then(setVeiculos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function formatForEdit(e: any) {
    return {
      razaoSocial: e.razaoSocial || "", cidade: e.cidade || "", uf: e.uf || "",
      endereco: e.endereco || "", bairro: e.bairro || "", cep: e.cep || "",
      dataChegada: e.dataChegada ? e.dataChegada.slice(0, 10) : "",
      dataAgendada: e.dataAgendada ? e.dataAgendada.slice(0, 10) : "",
      dataEntrega: e.dataEntrega ? e.dataEntrega.slice(0, 10) : "",
      motoristaId: e.motoristaId || "", veiculoId: e.veiculoId || "",
      valorFrete: String(e.valorFrete || 0), valorDescarga: String(e.valorDescarga || 0),
      valorArmazenagem: String(e.valorArmazenagem || 0),
      quantidadePaletes: String(e.quantidadePaletes || 0),
      valorMotorista: String(e.valorMotorista || 0), valorSaida: String(e.valorSaida || 0),
      adiantamentoMotorista: String(e.adiantamentoMotorista || 0), descontosMotorista: String(e.descontosMotorista || 0),
      dataAdiantamento: e.dataAdiantamento ? e.dataAdiantamento.slice(0, 10) : "",
      dataPagamentoSaldo: e.dataPagamentoSaldo ? e.dataPagamentoSaldo.slice(0, 10) : "",
      statusCanhoto: e.statusCanhoto || "PENDENTE",
      observacoes: e.observacoes || "", status: e.status,
      // Complementar:
      motoristaComplId: e.motoristaComplId || "",
      veiculoComplId: e.veiculoComplId || "",
      valorMotoristaCompl: String(e.valorMotoristaCompl || 0),
      valorSaidaCompl: String(e.valorSaidaCompl || 0),
      adiantamentoMotoristaCompl: String(e.adiantamentoMotoristaCompl || 0),
      descontosMotoristaCompl: String(e.descontosMotoristaCompl || 0),
      dataAdiantamentoCompl: e.dataAdiantamentoCompl ? e.dataAdiantamentoCompl.slice(0, 10) : "",
      dataPagamentoSaldoCompl: e.dataPagamentoSaldoCompl ? e.dataPagamentoSaldoCompl.slice(0, 10) : "",
      statusCanhotoCompl: e.statusCanhotoCompl || "PENDENTE",
    };
  }

  async function handleStatusChange(newStatus: string) {
    // Se está finalizando (ENTREGUE ou FINALIZADO) e a entrega ainda não tem dataEntrega,
    // abre modal pedindo a data ao invés de setar a data atual automaticamente.
    if ((newStatus === "ENTREGUE" || newStatus === "FINALIZADO") && !entrega?.dataEntrega) {
      setPendingStatus(newStatus);
      setPendingContext("status");
      setDataEntregaInput(entrega?.dataAgendada ? entrega.dataAgendada.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setShowDataEntregaPrompt(true);
      return;
    }
    await applyStatusChange(newStatus);
  }

  // Só vale abrir o modal de aviso se houver um embarcador com número válido.
  async function temEmbarcadorComWhatsApp(): Promise<boolean> {
    try {
      const r = await fetch(`/api/entregas/${id}/embarcadores`);
      if (!r.ok) return false;
      const d = await r.json();
      return (d.embarcadores || []).some((e: any) => e.telefoneValido);
    } catch { return false; }
  }

  async function applyStatusChange(newStatus: string, dataEntregaISO?: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/entregas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          ...(dataEntregaISO ? { dataEntrega: dataEntregaISO } : {}),
        }),
      });
      const updated = await res.json();
      if (!res.ok) {
        toast.error(updated.message || updated.error || "Erro ao atualizar");
        return;
      }
      setEntrega(updated);
      toast.success("Status atualizado");

      // Concluiu a entrega e algum embarcador tem WhatsApp cadastrado? Oferece
      // o aviso — nunca envia sozinho: cada mensagem sai de uma cota pequena.
      // Sem número cadastrado não abre nada, para não virar popup inútil.
      const concluiu = newStatus === "ENTREGUE" || newStatus === "FINALIZADO";
      const podeAvisar = concluiu && (await temEmbarcadorComWhatsApp());

      if (newStatus === "FINALIZADO" && QUALIDADE_ENABLED) {
        setShowQualityPrompt(true);
        // A qualidade vem primeiro; o aviso entra na fila para depois dela.
        setAvisoPendente(podeAvisar);
      } else if (podeAvisar) {
        setShowAvisoEntrega(true);
      }
    } catch { toast.error("Erro ao atualizar"); }
    finally { setSaving(false); }
  }

  async function handleConfirmDataEntrega() {
    if (!dataEntregaInput) { toast.error("Informe a data de entrega"); return; }
    const iso = new Date(dataEntregaInput + "T12:00:00").toISOString();
    setShowDataEntregaPrompt(false);
    const status = pendingStatus;
    const ctx = pendingContext;
    setPendingStatus(null);
    if (ctx === "resolve") {
      await doResolveOcorrencia(iso);
    } else if (status) {
      await applyStatusChange(status, iso);
    }
  }

  async function handleSaveEdit() {
    // Validação client-side: se o form finaliza mas não tem data, avisa antes de tentar salvar
    const finalizando = (editForm.status === "FINALIZADO" || editForm.status === "ENTREGUE");
    if (finalizando && !editForm.dataEntrega && !entrega?.dataEntrega) {
      toast.error("Preencha a Data de Entrega antes de finalizar");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/entregas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          valorFrete: parseFloat(editForm.valorFrete) || 0,
          valorDescarga: parseFloat(editForm.valorDescarga) || 0,
          valorArmazenagem: parseFloat(editForm.valorArmazenagem) || 0,
          quantidadePaletes: parseInt(editForm.quantidadePaletes) || 0,
          valorMotorista: parseFloat(editForm.valorMotorista) || 0,
          valorSaida: parseFloat(editForm.valorSaida) || 0,
          adiantamentoMotorista: parseFloat(editForm.adiantamentoMotorista) || 0,
          descontosMotorista: parseFloat(editForm.descontosMotorista) || 0,
          dataAdiantamento: editForm.dataAdiantamento || null,
          dataPagamentoSaldo: editForm.dataPagamentoSaldo || null,
          // Complementar:
          motoristaComplId: editForm.motoristaComplId || null,
          veiculoComplId: editForm.veiculoComplId || null,
          valorMotoristaCompl: parseFloat(editForm.valorMotoristaCompl) || 0,
          valorSaidaCompl: parseFloat(editForm.valorSaidaCompl) || 0,
          adiantamentoMotoristaCompl: parseFloat(editForm.adiantamentoMotoristaCompl) || 0,
          descontosMotoristaCompl: parseFloat(editForm.descontosMotoristaCompl) || 0,
          dataAdiantamentoCompl: editForm.dataAdiantamentoCompl || null,
          dataPagamentoSaldoCompl: editForm.dataPagamentoSaldoCompl || null,
          statusCanhotoCompl: editForm.statusCanhotoCompl || "PENDENTE",
        }),
      });
      const updated = await res.json();
      if (!res.ok) {
        throw new Error(updated.error || updated.message || "Erro retornado pelo servidor");
      }
      setEntrega(updated);
      setShowEdit(false);
      toast.success("Entrega atualizada");

      if (editForm.status === "FINALIZADO" && entrega?.status !== "FINALIZADO" && QUALIDADE_ENABLED) {
        setShowQualityPrompt(true);
      }
    } catch (err: any) {
      console.error("Erro ao salvar entrega:", err);
      toast.error(err.message || "Erro ao salvar");
    } finally { setSaving(false); }
  }

  async function handleGerarDiaria() {
    setSavingDiaria(true);
    try {
      const res = await fetch("/api/diarias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entregaId: id,
          motivo: diariaForm.motivo || null,
          valor: diariaForm.valor ? parseFloat(diariaForm.valor.replace(",", ".")) : 0,
          observacoes: diariaForm.observacoes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao gerar diária");
        return;
      }
      const updated = await fetch(`/api/entregas/${id}`).then((r) => r.json());
      setEntrega(updated);
      setShowDiaria(false);
      setDiariaForm({ motivo: "", valor: "", observacoes: "" });
      toast.success(`Diária ${data.numero} criada${data.valor === 0 ? " (valor pendente)" : ""}`);
    } catch {
      toast.error("Erro ao gerar diária");
    } finally { setSavingDiaria(false); }
  }

  async function handleOcorrencia() {
    if (!ocorrForm.descricao) { toast.error("Descreva a ocorrência"); return; }
    setSaving(true);
    try {
      const ocRes = await fetch("/api/entregas/" + id + "/ocorrencia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ocorrForm),
      });
      if (!ocRes.ok) { toast.error("Erro ao registrar ocorrência"); return; }
      await fetch(`/api/entregas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "OCORRENCIA" }),
      });
      const updated = await fetch(`/api/entregas/${id}`).then((r) => r.json());
      setEntrega(updated);
      setShowOcorrencia(false);
      setOcorrForm({ tipo: "ATRASO", descricao: "" });
      toast.success("Ocorrência registrada");
    } finally { setSaving(false); }
  }

  // Cancelamento de NF é registro manual: a API do Meu Danfe não informa
  // situação de documento, então a informação vem do cliente e alguém marca.
  async function handleToggleCancelada(nf: any) {
    const cancelar = !nf.cancelada;
    let motivo: string | null = null;
    if (cancelar) {
      motivo = window.prompt(
        `Marcar a NF ${nf.numero} como CANCELADA?\n\nIsto registra apenas no TMS — quem cancela na SEFAZ é o emitente.\nInforme o motivo ou quem avisou:`,
        ""
      );
      if (motivo === null) return;
    } else if (!window.confirm(`Desfazer o cancelamento da NF ${nf.numero}?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/notas/${nf.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelada: cancelar, motivo }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro");
      toast.success(cancelar ? `NF ${nf.numero} marcada como cancelada` : "Cancelamento desfeito");
      const updated = await fetch(`/api/entregas/${id}`).then((r) => r.json());
      setEntrega(updated);
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar a nota");
    }
  }

  async function handleReentrega() {
    if (!confirm("Gerar uma Reentrega criará uma NOVA entrega com as mesmas NFs e manterá a atual fechada com a rota antiga (para histórico financeiro). Deseja continuar?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/entregas/${id}/reentrega`, { method: "POST" });
      if (!res.ok) throw new Error("Erro ao gerar reentrega");
      const { novaEntregaId } = await res.json();
      toast.success("Reentrega gerada com sucesso!");
      router.push(`/entregas/${novaEntregaId}`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar");
      setSaving(false);
    }
  }

  async function handleResolveOcorrencia() {
    // Fluxo especial: Devolvido à Fábrica
    if (statusFinalEntrega === "DEVOLVIDO_FABRICA") {
      const { transportadora, motorista, placa, dataCarregamento } = devolucaoData;
      if (!transportadora.trim() || !motorista.trim() || !placa.trim() || !dataCarregamento) {
        toast.error("Preencha transportadora, motorista, placa e data do carregamento");
        return;
      }
      await doResolveOcorrencia(dataCarregamento);
      return;
    }

    if (!resolucaoTexto.trim()) {
      toast.error("Insira uma observação para a resolução");
      return;
    }
    // Se resolução vai finalizar/entregar sem data existente, pergunta a data primeiro
    const finalizando = statusFinalEntrega === "FINALIZADO" || statusFinalEntrega === "ENTREGUE";
    if (finalizando && !entrega?.dataEntrega) {
      setPendingStatus(statusFinalEntrega);
      setPendingContext("resolve");
      setDataEntregaInput(entrega?.dataAgendada ? entrega.dataAgendada.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setShowResolveModal(false);
      setShowDataEntregaPrompt(true);
      return;
    }
    await doResolveOcorrencia();
  }

  async function doResolveOcorrencia(dataEntregaISO?: string) {
    setSalvandoResolucao(true);
    try {
      const ultimaOcorr = entrega.ocorrencias?.find((o: any) => !o.resolvida);
      if (!ultimaOcorr) {
        toast.error("Nenhuma ocorrência em aberto encontrada");
        return;
      }

      // Devolvido à Fábrica: monta resolução automática + payload especial
      const isDevolucaoFabrica = statusFinalEntrega === "DEVOLVIDO_FABRICA";
      let resolucaoFinal = resolucaoTexto;
      if (isDevolucaoFabrica) {
        const dataFmt = new Date(devolucaoData.dataCarregamento + "T12:00:00").toLocaleDateString("pt-BR");
        const autoTxt = `Devolvido à Fábrica em ${dataFmt} — Transp: ${devolucaoData.transportadora} · Mot: ${devolucaoData.motorista} · Placa: ${devolucaoData.placa}`;
        resolucaoFinal = resolucaoTexto.trim() ? `${autoTxt}\n${resolucaoTexto}` : autoTxt;
      }

      const resOcorr = await fetch(`/api/entregas/${id}/ocorrencia`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocorrenciaId: ultimaOcorr.id,
          resolucao: resolucaoFinal
        })
      });

      if (!resOcorr.ok) throw new Error("Erro ao salvar resolução da ocorrência");

      const entregaBody: any = {
        status: isDevolucaoFabrica ? "FINALIZADO" : statusFinalEntrega,
        ...(dataEntregaISO ? { dataEntrega: dataEntregaISO } : {}),
      };
      if (isDevolucaoFabrica) {
        entregaBody.dataDevolucaoFabrica = new Date(devolucaoData.dataCarregamento + "T12:00:00").toISOString();
        entregaBody.transportadoraDevolucao = devolucaoData.transportadora;
        entregaBody.motoristaDevolucao = devolucaoData.motorista;
        entregaBody.placaDevolucao = devolucaoData.placa;
        if (!entregaBody.dataEntrega) entregaBody.dataEntrega = entregaBody.dataDevolucaoFabrica;
      }

      const resEntrega = await fetch(`/api/entregas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entregaBody)
      });

      if (!resEntrega.ok) {
        const err = await resEntrega.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Erro ao atualizar status da entrega");
      }

      toast.success("Ocorrência resolvida com sucesso!");
      setShowResolveModal(false);
      setResolucaoTexto("");
      const updated = await fetch(`/api/entregas/${id}`).then((r) => r.json());
      setEntrega(updated);
    } catch (error: any) {
      toast.error(error.message || "Erro ao resolver ocorrência");
    } finally {
      setSalvandoResolucao(false);
    }
  }

  async function handleSeparar() {
    if (selectedNotas.length === 0) { toast.error("Selecione pelo menos uma nota"); return; }
    if (selectedNotas.length === entrega.notas.length) { toast.error("Selecione apenas parte das notas para separar"); return; }
    setSeparando(true);
    try {
      const res = await fetch(`/api/entregas/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "separar", notaIds: selectedNotas }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
      const data = await res.json();
      toast.success(`${data.notasSeparadas} nota(s) separada(s) em nova entrega`);
      setSelectedNotas([]);
      // Reload entrega
      const updated = await fetch(`/api/entregas/${id}`).then((r) => r.json());
      setEntrega(updated);
      setEditForm(formatForEdit(updated));
    } catch (err: any) {
      toast.error(err.message || "Erro ao separar notas");
    } finally { setSeparando(false); }
  }

  function toggleNota(notaId: string) {
    setSelectedNotas((prev) => prev.includes(notaId) ? prev.filter((id) => id !== notaId) : [...prev, notaId]);
  }

  async function handleViewDanfe(notaId: string) {
    setDanfeModal({ open: true, xml: null, loading: true, fullscreen: false });
    try {
      const res = await fetch(`/api/notas/${notaId}/danfe`);
      if (!res.ok) throw new Error("XML não disponível");
      const { xml } = await res.json();
      setDanfeModal({ open: true, xml, loading: false, fullscreen: false });
    } catch {
      setDanfeModal({ open: false, xml: null, loading: false, fullscreen: false });
      toast.error("XML da DANFE não disponível para esta nota");
    }
  }

  // Add NFs handlers
  function fetchNotasDisp(query?: string) {
    const q = (query ?? "").trim();
    const url = q
      ? `/api/notas?q=${encodeURIComponent(q)}&limit=500`
      : `/api/notas?semEntrega=true&limit=500`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        const list = (d.notas || []).filter((n: any) => n.entregaId !== id);
        setNotasDisp(list);
      });
  }

  function openAddNFModal() {
    setShowAddNF(true);
    setSelectedNFIds([]);
    setSearchNF("");
    fetchNotasDisp();
  }

  useEffect(() => {
    if (!showAddNF) return;
    const t = setTimeout(() => fetchNotasDisp(searchNF), 300);
    return () => clearTimeout(t);
  }, [searchNF, showAddNF]);

  const filteredNotasDisp = notasDisp;

  function toggleNF(nfId: string) {
    setSelectedNFIds(prev => prev.includes(nfId) ? prev.filter(x => x !== nfId) : [...prev, nfId]);
  }

  function toggleAllNFs() {
    const allSelected = filteredNotasDisp.every(n => selectedNFIds.includes(n.id));
    if (allSelected) {
      setSelectedNFIds(prev => prev.filter(pid => !filteredNotasDisp.some(n => n.id === pid)));
    } else {
      setSelectedNFIds(prev => Array.from(new Set([...prev, ...filteredNotasDisp.map(n => n.id)])));
    }
  }

  async function handleAddNFs() {
    if (selectedNFIds.length === 0) return;
    setAddingNFs(true);
    try {
      const res = await fetch("/api/notas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedNFIds, entregaId: id }),
      });
      if (!res.ok) throw new Error("Erro ao vincular notas");
      toast.success(`${selectedNFIds.length} nota(s) vinculada(s)`);
      setShowAddNF(false);
      setSelectedNFIds([]);
      // Reload entrega
      const updated = await fetch(`/api/entregas/${id}`).then(r => r.json());
      setEntrega(updated);
      setEditForm(formatForEdit(updated));
    } catch (err: any) {
      toast.error(err.message || "Erro ao vincular notas");
    } finally { setAddingNFs(false); }
  }

  const set = (k: string, v: string) => setEditForm((f: any) => ({ ...f, [k]: v }));
  const currentIdx = STATUS_FLOW.findIndex((s) => s.key === entrega?.status);

  if (loading) return <><Topbar title="Entrega" /><Loading /></>;
  if (!entrega || entrega.error) return <><Topbar title="Não encontrada" /><div className="p-8 text-center" style={{ color: "var(--text3)" }}>Entrega não encontrada.</div></>;

  return (
    <>
      <Topbar
        title={entrega.notas && entrega.notas.length > 0 ? `NF ${entrega.notas.map((n: any) => n.numero).join(", ")}` : entrega.codigo}
        subtitle={entrega.razaoSocial}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ChevronLeft size={14} /> Voltar
            </Button>
            {!isReadOnly && (
              <Button variant="ghost" size="sm" onClick={() => {
                setEditForm(formatForEdit(entrega));
                setShowComplFields(!!entrega.motoristaComplId);
                setShowEdit(true);
              }}>
                <Copy size={14} /> Editar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => window.open(`/imprimir/carta-frete/entrega/${id}`, '_blank')}>
              <Printer size={14} /> Carta Frete
            </Button>
            {!isReadOnly && (
              <Button variant="ghost" size="sm" onClick={() => setShowLinkMotorista(true)}>
                <Smartphone size={14} /> Link Motorista
              </Button>
            )}
            {!isReadOnly && (
              <button
                onClick={() => setShowSugestao(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border-2 transition-all hover:bg-blue-50 dark:hover:bg-blue-950/30"
                style={{ borderColor: "#3b82f6", color: "#3b82f6", background: "transparent" }}
                title="Sugerir veículo baseado na carga ou histórico"
              >
                <Truck size={14} /> Sugerir Veículo
              </button>
            )}
            {entrega.motoristaComplId && (
              <Button variant="ghost" size="sm" onClick={() => window.open(`/imprimir/carta-frete/entrega/${id}?motorista=complementar`, '_blank')}>
                <Printer size={14} /> Carta Frete Compl.
              </Button>
            )}
            {!isReadOnly && (
              <button
                onClick={() => setShowDiaria(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border-2 transition-all hover:bg-amber-50 dark:hover:bg-amber-950/30"
                style={{ borderColor: "#d97706", color: "#d97706", background: "transparent" }}
                title="Gerar diária (penalidade financeira sem alterar status)"
              >
                <DollarSign size={14} /> Gerar Diária
              </button>
            )}
            {!isReadOnly && (
              <button
                onClick={() => setShowTicket(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border-2 transition-all hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                style={{ borderColor: "#059669", color: "#059669", background: "transparent" }}
                title="Montar a solicitação de aprovação de ticket para o embarcador"
              >
                <Receipt size={14} /> Solicitar Ticket
              </button>
            )}
            {!isReadOnly && (entrega.status === "ENTREGUE" || entrega.status === "FINALIZADO") && (
              <button
                onClick={() => setShowAvisoEntrega(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border-2 transition-all hover:bg-green-50 dark:hover:bg-green-950/30"
                style={{ borderColor: "#25d366", color: "#25d366", background: "transparent" }}
                title="Avisar o embarcador por WhatsApp que a entrega foi concluída"
              >
                <MessageCircle size={14} /> Avisar Embarcador
              </button>
            )}
            {!isReadOnly && entrega.status !== "OCORRENCIA" && entrega.status !== "FINALIZADO" && (
              <Button variant="danger" size="sm" onClick={() => setShowOcorrencia(true)}>
                <AlertCircle size={14} /> Ocorrência
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Status flow card */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-neutral-400">Fluxo Operacional</span>
            <div className="flex items-center gap-2">
              <StatusBadge status={entrega.status} />
              {QUALIDADE_ENABLED && entrega.qualidade?.id && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"
                  style={{ background: "rgba(234, 179, 8, 0.15)", color: "#ca8a04", border: "1px solid rgba(234, 179, 8, 0.3)" }}
                  title="Entrega possui registro de Qualidade">
                  ⭐ Avaliada
                </span>
              )}
            </div>
          </div>
          {entrega.notas?.some((nf: any) => nf.cancelada) && (
            <div className="flex items-center gap-3 p-3 rounded-xl mb-3 flex-wrap"
              style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.35)" }}>
              <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-600 flex-1">
                <b>Atenção:</b> {entrega.notas.filter((nf: any) => nf.cancelada).length} nota(s) desta carga
                {" "}está(ão) cancelada(s) —{" "}
                {entrega.notas.filter((nf: any) => nf.cancelada).map((nf: any) => `NF ${nf.numero}`).join(", ")}.
                {" "}Não entregar contra nota cancelada.
              </span>
            </div>
          )}

          {entrega.status === "OCORRENCIA" ? (
             <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 flex-wrap">
               <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
               <span className="text-sm text-red-600 flex-1">Esta entrega possui ocorrência registrada.{!isReadOnly && " Escolha uma ação:"}</span>
               {!isReadOnly && (
                 <div className="flex gap-2">
                   <Button size="sm" variant="ghost" className="border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 bg-white dark:bg-neutral-800 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={handleReentrega} disabled={saving}>
                     Gerar Reentrega (Duplicar)
                   </Button>
                   <Button size="sm" variant="ghost" className="border-green-200 dark:border-green-900/40 text-green-700 dark:text-green-400 bg-white dark:bg-neutral-800 hover:bg-green-50 dark:hover:bg-green-950/30" onClick={() => { setResolucaoTexto(""); setStatusFinalEntrega("FINALIZADO"); setShowResolveModal(true); }} disabled={saving}>
                     Resolver Ocorrência
                   </Button>
                   <Button size="sm" onClick={() => handleStatusChange("EM_ROTA")} disabled={saving}>
                     Retomar como Em Rota
                   </Button>
                 </div>
               )}
             </div>
          ) : (
            <div className="flex items-center gap-2">
              {STATUS_FLOW.map((s, i) => {
                const done = i < currentIdx;
                const current = i === currentIdx;
                const next = i === currentIdx + 1;
                return (
                  <div key={s.key} className="flex items-center gap-2 flex-1">
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <button
                        onClick={() => !isReadOnly && next && handleStatusChange(s.key)}
                        disabled={isReadOnly || saving || (!next && !current)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all
                          ${current ? "ring-2 ring-orange-400 scale-110" : ""}
                          ${!isReadOnly && next ? "cursor-pointer hover:scale-110" : done ? "" : "opacity-30 cursor-not-allowed"}
                        `}
                        style={{
                          background: done || current ? "var(--accent)" : "var(--surface2)",
                          border: current ? "2px solid var(--accent)" : "1px solid var(--border)",
                        }}
                        title={next ? `Avançar para ${s.label}` : ""}>
                        {done ? <CheckCircle2 size={18} color="#fff" /> : <span style={{ fontSize: "14px" }}>{s.icon}</span>}
                      </button>
                      <span className={`text-[9px] font-mono text-center leading-tight ${current ? "text-orange-600 font-bold" : done ? "text-slate-400 dark:text-neutral-500" : "text-slate-300 dark:text-neutral-600"}`}>
                        {s.label}
                      </span>
                    </div>
                    {i < STATUS_FLOW.length - 1 && (
                      <div className="h-px flex-none w-4" style={{ background: i < currentIdx ? "var(--accent)" : "var(--border)" }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Tabs */}
        <div className="flex gap-2 border-b" style={{ borderColor: "var(--border)" }}>
          <TabButton active={tab === "info"} onClick={() => setTab("info")} icon={FileText}>Informações</TabButton>
          <TabButton active={tab === "historico"} onClick={() => setTab("historico")} icon={History}>Histórico</TabButton>
          <TabButton active={tab === "avarias"} onClick={() => setTab("avarias")} icon={AlertTriangle}>Avarias</TabButton>
          <TabButton active={tab === "canhotos"} onClick={() => setTab("canhotos")} icon={Copy}>Canhotos & Anexos</TabButton>
          <TabButton active={tab === "paletes"} onClick={() => setTab("paletes")} icon={Layers}>Paletização</TabButton>
          {isAdmin && QUALIDADE_ENABLED && (
            <TabButton active={tab === "qualidade"} onClick={() => setTab("qualidade")} icon={ShieldCheck}>Qualidade Operacional</TabButton>
          )}
        </div>

        {/* Tab Content */}
        {tab === "info" && (
          <div className="space-y-4">
            {/* Top row: Destinatário, Operação, Financeiro */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Destinatário */}
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin size={14} className="text-accent" />
                  <span className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-neutral-400">Destinatário</span>
                </div>
                <div className="space-y-3">
                  <Field label="Razão Social" value={entrega.razaoSocial} />
                  <Field label="CNPJ" value={formatCNPJ(entrega.cnpj)} mono />
                  {entrega.notas && entrega.notas.length > 0 ? (
                    entrega.notas.map((n: any) => (
                      <div key={n.id} className="cursor-pointer group" onClick={() => handleViewDanfe(n.id)}>
                        <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-0.5">{`Chave de Acesso (NF ${n.numero})`}</div>
                        <div className="text-xs font-mono font-medium text-blue-500 group-hover:text-blue-400 group-hover:underline transition-colors flex items-center gap-1.5">
                          {n.chaveAcesso} <FileText size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ))
                  ) : (
                    entrega.chaveAcesso && <Field label="Chave de Acesso (NF)" value={entrega.chaveAcesso} mono color="#3b82f6" />
                  )}
                  <Field label="Cidade / UF" value={`${entrega.cidade}${entrega.uf ? ` — ${entrega.uf}` : ""}`} />
                  {entrega.endereco && <Field label="Endereço" value={`${entrega.endereco}${entrega.bairro ? `, ${entrega.bairro}` : ""}`} />}
                </div>
              </Card>

              {/* Operação */}
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Truck size={14} className="text-accent" />
                  <span className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-neutral-400">Operação</span>
                </div>
                <div className="space-y-3">
                  <Field label={entrega.motoristaCompl ? "Motorista (Principal)" : "Motorista"} value={entrega.motorista?.nome} />
                  <Field label={entrega.motoristaCompl ? "Veículo (Principal)" : "Veículo"} value={entrega.veiculo ? `${entrega.veiculo.placa} — ${entrega.veiculo.tipo}` : "—"} />
                  {entrega.veiculo?.dono && entrega.veiculo.dono.id !== entrega.motorista?.id && (
                    <Field
                      label="👑 Dono do Veículo"
                      value={`${entrega.veiculo.dono.nome}${entrega.veiculo.dono.telefone ? ` · ${entrega.veiculo.dono.telefone}` : ""}`}
                      color="#d97706"
                    />
                  )}
                  {entrega.motoristaCompl && (
                    <>
                      <Field label="Motorista Complementar" value={entrega.motoristaCompl.nome} color="#f97316" />
                      <Field label="Veículo Complementar" value={entrega.veiculoCompl ? `${entrega.veiculoCompl.placa} — ${entrega.veiculoCompl.tipo}` : "—"} color="#f97316" />
                      {entrega.veiculoCompl?.dono && entrega.veiculoCompl.dono.id !== entrega.motoristaCompl?.id && (
                        <Field
                          label="👑 Dono do Veículo Complementar"
                          value={`${entrega.veiculoCompl.dono.nome}${entrega.veiculoCompl.dono.telefone ? ` · ${entrega.veiculoCompl.dono.telefone}` : ""}`}
                          color="#d97706"
                        />
                      )}
                    </>
                  )}
                  <Field label="Rota" value={entrega.rota?.codigo} mono />
                  <Field label="Paletes" value={entrega.quantidadePaletes > 0 ? String(entrega.quantidadePaletes) : "—"} />
                  <Field label="Data Chegada" value={formatDate(entrega.dataChegada)} mono />
                  <Field label="Data Agendada" value={formatDate(entrega.dataAgendada)} mono />
                  <Field label="Data Entrega" value={formatDate(entrega.dataEntrega)} mono />
                  <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                    <Field label="Observações da Carga" value={entrega.observacoes || "—"} />
                  </div>
                </div>
              </Card>

              {/* Financeiro */}
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign size={14} className="text-emerald-500" />
                  <span className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-neutral-400">Financeiro</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                    <span className="text-[10px] font-bold">RECEITA CLIENTE</span>
                    <span className="font-mono text-xs">{formatCurrency(entrega.valorFrete)}</span>
                  </div>
                  {entrega.valorDescarga > 0 && (
                    <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-[10px] font-bold">DESCARGA (REEMBOLSO)</span>
                      <span className="font-mono text-xs">{formatCurrency(entrega.valorDescarga)}</span>
                    </div>
                  )}
                  {entrega.armazenagemCalc ? (
                    <>
                      <div className="flex justify-between items-center bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-3 py-1.5 rounded-lg border border-amber-100 dark:border-amber-900/40">
                        <span className="text-[10px] font-bold">ARMAZENAGEM {entrega.armazenagemCalc?.emAberto ? "(em curso)" : ""}</span>
                        <span className="font-mono text-xs">{formatCurrency(entrega.armazenagemCalc?.valorTotal)}</span>
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text3)" }}>
                        {entrega.armazenagemCalc?.diasDecorridos} dia(s) · {entrega.quantidadePaletes || 0} palete(s)
                      </div>
                      {entrega.armazenagemCalc?.fornecedores?.map((f: any) => (
                        <div key={f.cnpjFornecedor || f.cnpjCliente} className="text-[9px] font-mono pl-2 border-l-2 border-amber-200 dark:border-amber-900/40" style={{ color: "var(--text3)" }}>
                          <span className="font-bold" style={{ color: "var(--text2)" }}>{f.nomeFornecedor || f.nomeCliente}</span>
                          {" · "}{f.diasFree} dias free · {formatCurrency(f.valorPaleteDia)}/pal/dia · {f.diasCobraveis} cobrável(is) → <span className="text-amber-700 font-bold">{formatCurrency(f.valorCalculado)}</span>
                        </div>
                      ))}
                    </>
                  ) : entrega.quantidadePaletes > 0 ? (
                    <div className="text-[10px]" style={{ color: "var(--text3)" }}>
                      {entrega.quantidadePaletes} palete(s) · nenhum fornecedor desta entrega tem tabela de armazenagem cadastrada
                    </div>
                  ) : null}
                  <div className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase mt-4">
                    {entrega.motoristaCompl ? "Custo Motorista Principal" : "Custo Motorista (Terceiro)"}
                  </div>
                  <Field label="Valor Combinado" value={formatCurrency(entrega.valorMotorista)} color="#f97316" />
                  <Field label="Saldo a Pagar" value={formatCurrency(entrega.saldoMotorista)} color={entrega.saldoMotorista > 0 ? "#f97316" : "#10b981"} />
                  <div className="mt-1">
                    <StatusBadge status={entrega.statusCanhoto} />
                  </div>

                  {entrega.motoristaCompl && (
                    <>
                      <div className="text-[10px] font-bold text-orange-500 uppercase mt-4">Custo Motorista Complementar</div>
                      <Field label="Valor Combinado Complementar" value={formatCurrency(entrega.valorMotoristaCompl)} color="#f97316" />
                      <Field label="Saldo a Pagar Complementar" value={formatCurrency(entrega.saldoMotoristaCompl)} color={entrega.saldoMotoristaCompl > 0 ? "#f97316" : "#10b981"} />
                      <div className="mt-1">
                        <StatusBadge status={entrega.statusCanhotoCompl} />
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </div>

            {/* Notas Fiscais Detail Cards */}
            {entrega.notas && entrega.notas.length > 0 && entrega.notas.map((nf: any) => (
              <NFDetailCard key={nf.id} nf={nf} onViewDanfe={handleViewDanfe} />
            ))}
          </div>
        )}

        {tab === "historico" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Carga */}
             <Card>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-accent" />
                    <span className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-neutral-400">Carga</span>
                    {entrega.notas?.length > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface2)", color: "var(--text3)" }}>
                        {entrega.notas.length} NFs
                      </span>
                    )}
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-2">
                      {selectedNotas.length > 0 && selectedNotas.length < (entrega.notas?.length || 0) && (
                        <Button size="sm" onClick={handleSeparar} loading={separando}>
                          <Scissors size={13} /> Separar {selectedNotas.length} NF(s)
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={openAddNFModal}>
                        <Plus size={13} /> Adicionar NFs
                      </Button>
                    </div>
                  )}
                </div>
                {!isReadOnly && entrega.notas?.length > 1 && (
                  <p className="text-[10px] mb-3" style={{ color: "var(--text3)" }}>
                    Selecione notas para separar em uma nova entrega
                  </p>
                )}
                {entrega.notas?.length > 0 && (
                  <div className="space-y-2">
                    {entrega.notas.map((nf: any) => {
                      const selected = selectedNotas.includes(nf.id);
                      return (
                        <div key={nf.id}
                          onClick={() => !isReadOnly && entrega.notas.length > 1 && toggleNota(nf.id)}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                            selected
                              ? "bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800 ring-1 ring-orange-200 dark:ring-orange-900/50"
                              : "bg-slate-50 dark:bg-neutral-900 border-slate-100 dark:border-neutral-800"
                          } ${!isReadOnly && entrega.notas.length > 1 ? "cursor-pointer hover:border-orange-200 dark:hover:border-orange-800/50" : ""}`}>
                          {!isReadOnly && entrega.notas.length > 1 && (
                            <input type="checkbox" checked={selected} readOnly
                              className="accent-orange-500 w-4 h-4 flex-shrink-0 pointer-events-none" />
                          )}
                          <FileText size={13} className="text-slate-400 dark:text-neutral-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold flex items-center gap-2">
                              <span className={nf.cancelada ? "line-through opacity-60" : ""}>NF {nf.numero}</span>
                              {nf.cancelada && (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                                  style={{ background: "rgba(239,68,68,.15)", color: "#ef4444" }}>
                                  Cancelada
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono truncate text-slate-500 dark:text-neutral-400">{nf.emitenteRazao}</div>
                            {nf.cancelada && nf.canceladaMotivo && (
                              <div className="text-[10px] mt-0.5 text-red-500">{nf.canceladaMotivo}</div>
                            )}
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <div className={`text-xs font-mono font-bold ${nf.cancelada ? "line-through opacity-50 text-slate-400" : "text-emerald-600"}`}>
                              {formatCurrency(nf.valorNota)}
                            </div>
                            {!isReadOnly && (
                              <button
                                onClick={(ev) => { ev.stopPropagation(); handleToggleCancelada(nf); }}
                                className="p-1 rounded hover:opacity-70 flex-shrink-0"
                                style={{ color: nf.cancelada ? "#ef4444" : "var(--text3)" }}
                                title={nf.cancelada ? "Desfazer cancelamento" : "Marcar nota como cancelada"}
                              >
                                <AlertCircle size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
             </Card>

             {/* Ocorrências */}
             <Card>
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle size={14} className="text-red-500" />
                  <span className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-neutral-400">Ocorrências</span>
                </div>
                {entrega.ocorrencias?.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                    <CheckCircle2 size={24} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Nenhuma ocorrência registrada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entrega.ocorrencias?.map((oc: any) => (
                      <div key={oc.id} className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
                         <div className="flex items-center justify-between mb-1">
                           <span className="text-xs font-bold text-red-600">{oc.tipo}</span>
                           <div className="flex items-center gap-1.5">
                             <span className="text-[10px] text-slate-400 dark:text-neutral-500">{formatDate(oc.createdAt)}</span>
                             <button
                               onClick={() => router.push("/avarias?tab=ocorrencias")}
                               className="p-1 px-1.5 rounded bg-white dark:bg-neutral-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all flex items-center gap-1 text-[9px] font-bold border border-red-200 dark:border-red-900/40"
                               title="Ver Painel de Ocorrências"
                             >
                               Ver Painel <ExternalLink size={9} />
                             </button>
                           </div>
                         </div>
                         <p className="text-xs text-slate-600 dark:text-neutral-300">{oc.descricao}</p>
                      </div>
                    ))}
                  </div>
                )}
             </Card>

             {/* CT-e da transportadora — mostra os CT-es únicos das notas desta entrega */}
             {(() => {
               const ctesUnicos = new Map<string, any>();
               for (const n of entrega.notas || []) {
                 if (n.cte?.id) ctesUnicos.set(n.cte.id, { ...n.cte, notasVinculadas: [] });
               }
               for (const n of entrega.notas || []) {
                 if (n.cte?.id) ctesUnicos.get(n.cte.id)?.notasVinculadas.push(n.numero);
               }
               const ctesList = Array.from(ctesUnicos.values());
               if (ctesList.length === 0) return null;
               return (
                 <Card>
                   <div className="flex items-center gap-2 mb-3">
                     <Truck size={14} className="text-blue-500" />
                     <span className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-neutral-400">CT-e da Transportadora — {ctesList.length}</span>
                     <button
                       onClick={() => router.push("/importacao?tab=cte")}
                       className="ml-auto text-[10px] font-bold hover:underline"
                       style={{ color: "var(--accent)" }}
                     >
                       Gerenciar <ExternalLink size={9} className="inline" />
                     </button>
                   </div>
                   <div className="space-y-2">
                     {ctesList.map((c: any) => (
                       <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.2)" }}>
                         <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-2 flex-wrap">
                             <span className="text-sm font-bold font-mono text-blue-700">CT-e {c.numero}{c.serie ? `/${c.serie}` : ""}</span>
                             <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{c.dataEmissao ? formatDate(c.dataEmissao) : "—"}</span>
                           </div>
                           <div className="text-[11px] mt-0.5" style={{ color: "var(--text2)" }}>
                             Transportadora: <strong>{c.emitenteNome || formatCNPJ(c.emitenteCnpj)}</strong>
                           </div>
                           <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text3)" }}>
                             Tomador: {c.tomadorNome || formatCNPJ(c.tomadorCnpj)}
                             {c.notasVinculadas.length > 0 && <> · NFs: {c.notasVinculadas.join(", ")}</>}
                           </div>
                         </div>
                         <div className="text-right ml-3">
                           <div className="text-sm font-bold font-mono text-blue-700">{formatCurrency(c.valorReceber)}</div>
                           {c.valorPedagio > 0 && (
                             <div className="text-[9px] font-mono" style={{ color: "var(--text3)" }}>Pedágio: {formatCurrency(c.valorPedagio)}</div>
                           )}
                         </div>
                       </div>
                     ))}
                   </div>
                 </Card>
               );
             })()}

             {/* Diárias vinculadas — mostra se houver alguma */}
             {entrega.diarias?.length > 0 && (
               <Card>
                 <div className="flex items-center gap-2 mb-3">
                   <DollarSign size={14} style={{ color: "#d97706" }} />
                   <span className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-neutral-400">Diárias — {entrega.diarias.length}</span>
                   <button
                     onClick={() => router.push("/faturamento?tab=diarias")}
                     className="ml-auto text-[10px] font-bold hover:underline"
                     style={{ color: "var(--accent)" }}
                   >
                     Ver em Faturamento <ExternalLink size={9} className="inline" />
                   </button>
                 </div>
                 <div className="space-y-2">
                   {entrega.diarias.map((d: any) => {
                     const isPaga = d.status === "PAGA";
                     const isPendenteValor = d.valor === 0 && d.status === "PENDENTE";
                     return (
                       <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg"
                         style={{ background: "rgba(217,119,6,.06)", border: "1px solid rgba(217,119,6,.25)" }}>
                         <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-2 flex-wrap">
                             <span className="text-sm font-bold font-mono" style={{ color: "#b45309" }}>{d.numero}</span>
                             <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatDate(d.dataOcorrencia)}</span>
                             <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                               style={{
                                 background: isPaga ? "rgba(16,185,129,.15)" : isPendenteValor ? "rgba(217,119,6,.15)" : "rgba(59,130,246,.15)",
                                 color: isPaga ? "#059669" : isPendenteValor ? "#d97706" : "#2563eb",
                               }}>
                               {isPaga ? "PAGA" : isPendenteValor ? "VALOR PENDENTE" : "PENDENTE"}
                             </span>
                           </div>
                           {d.motivo && (
                             <div className="text-[11px] mt-0.5" style={{ color: "var(--text2)" }}>{d.motivo}</div>
                           )}
                         </div>
                         <div className="text-right ml-3">
                           <div className="text-sm font-bold font-mono" style={{ color: d.valor > 0 ? "#059669" : "#d97706" }}>
                             {d.valor > 0 ? formatCurrency(d.valor) : "—"}
                           </div>
                         </div>
                       </div>
                     );
                   })}
                 </div>
               </Card>
             )}

             {/* NFS-e vinculadas — mostra se houver alguma */}
             {entrega.notasServico?.length > 0 && (
               <Card>
                 <div className="flex items-center gap-2 mb-3">
                   <FileText size={14} className="text-emerald-500" />
                   <span className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-neutral-400">Notas de Serviço (NFS-e) — {entrega.notasServico.length}</span>
                   <button
                     onClick={() => router.push("/importacao?tab=nfse")}
                     className="ml-auto text-[10px] font-bold hover:underline"
                     style={{ color: "var(--accent)" }}
                   >
                     Ver todas <ExternalLink size={9} className="inline" />
                   </button>
                 </div>
                 <div className="space-y-2">
                   {entrega.notasServico.map((n: any) => (
                     <div key={n.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: "rgba(16,185,129,.06)", border: "1px solid rgba(16,185,129,.2)" }}>
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 flex-wrap">
                           <span className="text-sm font-bold font-mono text-emerald-700">NFS-e {n.numero}</span>
                           <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatDate(n.dataEmissao)}</span>
                         </div>
                         <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--text2)" }} title={n.discriminacao || n.informacoesAdicionais || ""}>
                           {n.discriminacao || n.informacoesAdicionais || "—"}
                         </div>
                         <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text3)" }}>
                           Tomador: {n.tomadorRazao || formatCNPJ(n.tomadorCnpj)}
                         </div>
                       </div>
                       <div className="text-right ml-3">
                         <div className="text-sm font-bold font-mono text-emerald-700">{formatCurrency(n.valorServicos)}</div>
                         {n.codigoVerificacao && (
                           <div className="text-[9px] font-mono" style={{ color: "var(--text3)" }}>Cód: {n.codigoVerificacao}</div>
                         )}
                       </div>
                     </div>
                   ))}
                 </div>
               </Card>
             )}
          </div>
        )}

        {tab === "avarias" && (
          <AvariasTab entregaId={id} entrega={entrega} isReadOnly={isReadOnly} />
        )}

        {tab === "canhotos" && (
          <AnexosCard entregaId={id} readOnly={isReadOnly} rastreioToggle={isAdmin} />
        )}

        {tab === "qualidade" && isAdmin && QUALIDADE_ENABLED && (
          <Card>
            <div className="flex items-center gap-2 mb-6">
              <ShieldCheck className="text-accent" />
              <h2 className="text-lg font-bold">Avaliação de Qualidade Operacional</h2>
            </div>
            <QualityScoring entregaId={id} />
          </Card>
        )}

        {tab === "paletes" && (
          <PaletizacaoTab entrega={entrega} />
        )}
      </div>

      {/* Edit Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Editar Entrega" size="lg">
         <div className="grid grid-cols-2 gap-4">
            <Input label="Razão Social" value={editForm.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} />
            <Input label="Cidade" value={editForm.cidade} onChange={(e) => set("cidade", e.target.value)} />
            <Input label="UF" value={editForm.uf} onChange={(e) => set("uf", e.target.value)} maxLength={2} />
            <Input label="Endereço" value={editForm.endereco} onChange={(e) => set("endereco", e.target.value)} />
            <Input label="Bairro" value={editForm.bairro} onChange={(e) => set("bairro", e.target.value)} />
            <Input label="CEP" value={editForm.cep} onChange={(e) => set("cep", e.target.value)} />
            <Input label="Data Chegada" type="date" value={editForm.dataChegada} onChange={(e) => set("dataChegada", e.target.value)} />
            <Input label="Data Agendada" type="date" value={editForm.dataAgendada} onChange={(e) => set("dataAgendada", e.target.value)} />
            <Input label="Data Entrega" type="date" value={editForm.dataEntrega} onChange={(e) => set("dataEntrega", e.target.value)} />
            
            <ComboboxMotorista motoristas={motoristas} veiculos={veiculos} value={editForm.motoristaId} onChange={(id) => set("motoristaId", id)} onAutoFillVeiculo={(vid) => set("veiculoId", vid)} />
            <Select label="Veículo" value={editForm.veiculoId} onChange={(e) => set("veiculoId", e.target.value)}>
              <option value="">Selecionar...</option>
              {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.tipo}</option>)}
            </Select>

            {!showComplFields ? (
              <div className="col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-center border-dashed border-2 py-3 hover:bg-slate-50 dark:hover:bg-neutral-900"
                  onClick={() => setShowComplFields(true)}
                >
                  <Plus size={14} className="mr-2" /> Adicionar Motorista Complementar (Carga Complementar)
                </Button>
              </div>
            ) : (
              <>
                <div className="col-span-2 flex items-center justify-between py-2 border-b text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase">
                  <span>Motorista Complementar</span>
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-700 text-xs font-semibold normal-case"
                    onClick={() => {
                      set("motoristaComplId", "");
                      set("veiculoComplId", "");
                      set("valorMotoristaCompl", "0");
                      set("valorSaidaCompl", "0");
                      set("adiantamentoMotoristaCompl", "0");
                      set("descontosMotoristaCompl", "0");
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
                  value={editForm.motoristaComplId}
                  onChange={(id) => set("motoristaComplId", id)}
                  onAutoFillVeiculo={(vid) => set("veiculoComplId", vid)}
                  label="Motorista Complementar"
                />
                <Select
                  label="Veículo Complementar"
                  value={editForm.veiculoComplId}
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
                  value={editForm.valorMotoristaCompl}
                  onChange={(e) => set("valorMotoristaCompl", e.target.value)}
                />
                <Input
                  label="Pedágio/Saída Complementar"
                  type="number"
                  value={editForm.valorSaidaCompl}
                  onChange={(e) => set("valorSaidaCompl", e.target.value)}
                />
                <Input
                  label="Adiantamento Complementar"
                  type="number"
                  value={editForm.adiantamentoMotoristaCompl}
                  onChange={(e) => set("adiantamentoMotoristaCompl", e.target.value)}
                />
                <Input
                  label="Descontos Complementar"
                  type="number"
                  value={editForm.descontosMotoristaCompl}
                  onChange={(e) => set("descontosMotoristaCompl", e.target.value)}
                />
                
                <Input
                  label="Data Adiantamento Compl."
                  type="date"
                  value={editForm.dataAdiantamentoCompl}
                  onChange={(e) => set("dataAdiantamentoCompl", e.target.value)}
                />
                <Input
                  label="Data Pagamento Saldo Compl."
                  type="date"
                  value={editForm.dataPagamentoSaldoCompl}
                  onChange={(e) => set("dataPagamentoSaldoCompl", e.target.value)}
                />
                
                <Select
                  label="Status do Canhoto Compl."
                  value={editForm.statusCanhotoCompl}
                  onChange={(e) => set("statusCanhotoCompl", e.target.value)}
                  className="col-span-2"
                >
                  <option value="PENDENTE">Pendente</option>
                  <option value="RECEBIDO">Recebido</option>
                  <option value="COM_RESSALVA">Com Ressalva</option>
                </Select>
              </>
            )}
            <Select label="Status" value={editForm.status} onChange={(e) => set("status", e.target.value)}>
              {STATUS_FLOW.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              <option value="OCORRENCIA">Ocorrência</option>
            </Select>
            <Select label="Status do Canhoto" value={editForm.statusCanhoto} onChange={(e) => set("statusCanhoto", e.target.value)}>
              <option value="PENDENTE">Pendente</option>
              <option value="RECEBIDO">Recebido</option>
              <option value="COM_RESSALVA">Com Ressalva</option>
            </Select>
            
            <Input label="Qtd Paletes" type="number" value={editForm.quantidadePaletes} onChange={(e) => set("quantidadePaletes", e.target.value)} />
            <div className="col-span-2 py-2 border-b text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase">Valores e Financeiro (Motorista Principal)</div>
            <Input label="Valor Frete Cliente" type="number" value={editForm.valorFrete} onChange={(e) => set("valorFrete", e.target.value)} />
            <Input label="Valor Descarga (reembolso)" type="number" step="0.01" value={editForm.valorDescarga} onChange={(e) => set("valorDescarga", e.target.value)} placeholder="0,00" />

            <Input label="Valor Combinado Motorista" type="number" value={editForm.valorMotorista} onChange={(e) => set("valorMotorista", e.target.value)} />
            <Input label="Pedágio/Saída Motorista" type="number" value={editForm.valorSaida} onChange={(e) => set("valorSaida", e.target.value)} />
            <Input label="Adiantamento Motorista" type="number" value={editForm.adiantamentoMotorista} onChange={(e) => set("adiantamentoMotorista", e.target.value)} />
            <Input label="Descontos Motorista" type="number" value={editForm.descontosMotorista} onChange={(e) => set("descontosMotorista", e.target.value)} />
            
            <Input label="Data Adiantamento Motorista" type="date" value={editForm.dataAdiantamento} onChange={(e) => set("dataAdiantamento", e.target.value)} />
            <Input label="Data Pagamento Saldo Motorista" type="date" value={editForm.dataPagamentoSaldo} onChange={(e) => set("dataPagamentoSaldo", e.target.value)} />

            <Textarea label="Observações" value={editForm.observacoes} onChange={(e) => set("observacoes", e.target.value)} className="col-span-2" />
         </div>
         <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} loading={saving}>Salvar Alterações</Button>
         </div>
      </Modal>

      {/* Quality Prompt Modal */}
      <Modal
        open={showQualityPrompt}
        onClose={() => {
          setShowQualityPrompt(false);
          if (avisoPendente) { setAvisoPendente(false); setShowAvisoEntrega(true); }
        }}
        title="Avaliação de Qualidade Operacional"
        size="lg"
      >
        <div className="mb-4 p-3 rounded-xl flex items-center gap-3" style={{ background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.2)" }}>
          <ShieldCheck size={20} className="text-orange-500 flex-shrink-0" />
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            Entrega finalizada! Registre a avaliação de qualidade operacional antes de continuar.
          </p>
        </div>
        <QualityScoring entregaId={id} onSave={() => { setShowQualityPrompt(false); toast.success("Avaliação salva!"); }} />
      </Modal>

      {/* DANFE Modal */}
      {danfeModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,.5)" }}>
          <div
            className={`relative rounded-2xl shadow-2xl flex flex-col animate-fadeIn transition-all duration-300 ${danfeModal.fullscreen ? "w-full h-full rounded-none" : "w-full max-w-4xl max-h-[90vh]"}`}
            style={{ background: "var(--surface)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <span className="font-bold text-sm" style={{ color: "var(--text)" }}>DANFE</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (!danfeModal.xml) return;
                    const parsed = parseDanfeXML(danfeModal.xml);
                    const blob = new Blob([danfeModal.xml], { type: "text/xml" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `NFe_${parsed.numero || "nfe"}_${parsed.serie || ""}.xml`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1"
                  title="Baixar XML"
                >
                  <Download size={16} className="text-slate-500 dark:text-neutral-400" />
                  <span className="text-xs text-slate-500 dark:text-neutral-400">XML</span>
                </button>
                <select
                  value={formatoDanfe}
                  onChange={(e) => setFormatoDanfe(e.target.value as FormatoDanfe)}
                  className="text-xs px-2 py-1.5 rounded-lg outline-none"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  title="Formato do PDF oficial"
                >
                  {(Object.keys(ROTULO_FORMATO) as FormatoDanfe[]).map((f) => (
                    <option key={f} value={f}>{ROTULO_FORMATO[f]}</option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    if (!danfeModal.xml) return;
                    setDownloadingPdf(true);
                    try {
                      const parsed = parseDanfeXML(danfeModal.xml);
                      if (!parsed.chaveAcesso) throw new Error("Chave de acesso indisponível");
                      // O XML vai junto como reserva: se a nota ainda não estiver
                      // na Área do Cliente, a rota envia (grátis) e baixa depois.
                      await baixarDanfeOficial(parsed.chaveAcesso, formatoDanfe, {
                        filename: `DANFE_${parsed.numero || "nfe"}_${parsed.serie || ""}`,
                        xml: danfeModal.xml,
                      });
                      toast.success("PDF gerado!");
                    } catch (e: any) {
                      toast.error(e.message || "Erro ao gerar PDF");
                    } finally {
                      setDownloadingPdf(false);
                    }
                  }}
                  disabled={downloadingPdf}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Baixar PDF"
                >
                  {downloadingPdf ? <Loader2 size={16} className="text-slate-500 dark:text-neutral-400 animate-spin" /> : <Download size={16} className="text-slate-500 dark:text-neutral-400" />}
                  <span className="text-xs text-slate-500 dark:text-neutral-400">PDF</span>
                </button>
                <button
                  onClick={() => {
                    const el = document.getElementById("danfe-print");
                    if (!el) return;
                    const win = window.open("", "_blank");
                    if (!win) return;
                    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((s) => s.outerHTML).join("");
                    win.document.write(`<html><head>${styles}</head><body style="padding:10px">${el.outerHTML}</body></html>`);
                    win.document.close();
                    win.onload = () => { win.print(); };
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
                  title="Imprimir"
                >
                  <Printer size={16} className="text-slate-500 dark:text-neutral-400" />
                </button>
                <button
                  onClick={() => setDanfeModal((prev) => ({ ...prev, fullscreen: !prev.fullscreen }))}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
                  title={danfeModal.fullscreen ? "Reduzir" : "Ampliar"}
                >
                  {danfeModal.fullscreen ? <Minimize2 size={16} className="text-slate-500 dark:text-neutral-400" /> : <Maximize2 size={16} className="text-slate-500 dark:text-neutral-400" />}
                </button>
                <button
                  onClick={() => setDanfeModal({ open: false, xml: null, loading: false, fullscreen: false })}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
                  title="Fechar"
                >
                  <span className="text-slate-500 dark:text-neutral-400 text-lg leading-none">&times;</span>
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-auto p-4">
              {danfeModal.loading ? (
                <div className="flex items-center justify-center py-16"><Loading /></div>
              ) : danfeModal.xml ? (
                <DanfeViewer data={parseDanfeXML(danfeModal.xml)} />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Add NFs Modal */}
      <Modal open={showAddNF} onClose={() => setShowAddNF(false)} title="Vincular Notas Fiscais a esta Entrega" size="lg">
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
            <Input
              placeholder="Buscar por número NF, emitente, CNPJ..."
              value={searchNF}
              onChange={(e) => setSearchNF(e.target.value)}
              className="pl-9"
            />
          </div>

          {filteredNotasDisp.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={filteredNotasDisp.length > 0 && filteredNotasDisp.every(n => selectedNFIds.includes(n.id))}
                  onChange={toggleAllNFs}
                  className="accent-orange-500 w-4 h-4"
                />
                Selecionar todos ({filteredNotasDisp.length})
              </label>
              <span className="text-xs text-slate-500 dark:text-neutral-400">
                {selectedNFIds.length} selecionada(s)
              </span>
            </div>
          )}

          <div className="max-h-[50vh] overflow-y-auto border rounded-lg" style={{ borderColor: "var(--border)" }}>
            {filteredNotasDisp.length === 0 ? (
              <div className="text-center py-8 text-slate-400 dark:text-neutral-500 text-xs">
                {notasDisp.length === 0 ? "Nenhuma NF sem entrega disponível" : "Nenhuma NF encontrada"}
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {filteredNotasDisp.map((nf: any) => {
                  const selected = selectedNFIds.includes(nf.id);
                  return (
                    <div
                      key={nf.id}
                      onClick={() => toggleNF(nf.id)}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                        selected ? "bg-orange-50 dark:bg-orange-950/30" : "hover:bg-slate-50 dark:hover:bg-neutral-900"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        readOnly
                        className="accent-orange-500 w-4 h-4 flex-shrink-0 pointer-events-none"
                      />
                      <FileText size={14} className="text-slate-400 dark:text-neutral-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">NF {nf.numero}</span>
                          {nf.emitenteCnpj && (
                            <span className="text-[10px] font-mono text-slate-400 dark:text-neutral-500">{formatCNPJ(nf.emitenteCnpj)}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-neutral-400 truncate">{nf.emitenteRazao}</div>
                        <div className="text-[10px] text-slate-400 dark:text-neutral-500 truncate">→ {nf.destinatarioRazao}</div>
                        {nf.entrega && (
                          <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
                            ⚠ Vinculada a {nf.entrega.codigo} — será movida
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-mono text-emerald-600 font-bold">{formatCurrency(nf.valorNota)}</div>
                        <div className="text-[10px] text-slate-400 dark:text-neutral-500">
                          {formatWeight(nf.pesoBruto)} · {nf.volumes} vol
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowAddNF(false)}>Cancelar</Button>
          <Button
            onClick={handleAddNFs}
            loading={addingNFs}
            disabled={selectedNFIds.length === 0}
          >
            <Plus size={13} /> Vincular {selectedNFIds.length > 0 ? `${selectedNFIds.length} NF(s)` : ""}
          </Button>
        </div>
      </Modal>

      {/* Solicitação de Ticket */}
      <TicketModal open={showTicket} onClose={() => setShowTicket(false)} entregaId={String(id)} />

      {/* Diária Modal */}
      <Modal open={showDiaria} onClose={() => setShowDiaria(false)} title="Gerar Diária" size="sm">
        <div className="space-y-4">
          <div className="p-3 rounded-xl flex items-start gap-2" style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.3)" }}>
            <DollarSign size={16} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
            <div className="text-xs" style={{ color: "var(--text2)" }}>
              Cria uma cobrança de diária pro cliente <strong>{entrega?.razaoSocial}</strong>. A entrega continua com o status atual.
            </div>
          </div>
          <Input
            label="Motivo (opcional)"
            value={diariaForm.motivo}
            onChange={(e) => setDiariaForm((f) => ({ ...f, motivo: e.target.value }))}
            placeholder="ex: atraso 1 dia, reagendamento"
          />
          <div>
            <Input
              label="Valor (R$)"
              type="text"
              value={diariaForm.valor}
              onChange={(e) => setDiariaForm((f) => ({ ...f, valor: e.target.value }))}
              placeholder="0,00"
            />
            <div className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>
              Deixe zerado para preencher o valor depois no Faturamento.
            </div>
          </div>
          <Textarea
            label="Observações"
            value={diariaForm.observacoes}
            onChange={(e) => setDiariaForm((f) => ({ ...f, observacoes: e.target.value }))}
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowDiaria(false)}>Cancelar</Button>
          <button
            onClick={handleGerarDiaria}
            disabled={savingDiaria}
            className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "#d97706", color: "white" }}
          >
            <DollarSign size={14} /> {savingDiaria ? "Salvando..." : "Gerar Diária"}
          </button>
        </div>
      </Modal>

      {/* Ocorrência Modal */}
      <Modal open={showOcorrencia} onClose={() => setShowOcorrencia(false)} title="Registrar Ocorrência" size="sm">
        <div className="space-y-4">
          <Select label="Tipo" value={ocorrForm.tipo} onChange={(e) => setOcorrForm((f) => ({ ...f, tipo: e.target.value }))}>
            {["ATRASO", "AVARIA", "RECUSA", "ENDERECO_NAO_ENCONTRADO", "CLIENTE_AUSENTE", "OUTROS"].map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </Select>
          <Textarea label="Descrição *" value={ocorrForm.descricao} onChange={(e) => setOcorrForm((f) => ({ ...f, descricao: e.target.value }))} rows={4} />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <Button variant="ghost" onClick={() => setShowOcorrencia(false)}>Cancelar</Button>
          <Button variant="danger" onClick={handleOcorrencia} loading={saving}>Registrar</Button>
        </div>
      </Modal>

      {/* DATA ENTREGA PROMPT — pergunta quando o usuário finaliza sem data preenchida */}
      <Modal open={showDataEntregaPrompt} onClose={() => { setShowDataEntregaPrompt(false); setPendingStatus(null); }} title="Informar Data da Entrega" size="sm">
        <div className="space-y-4">
          <div className="p-3 rounded-xl flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-700">
            <Calendar size={18} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm">
              Esta entrega ainda não tem <b>Data de Entrega</b> registrada. Informe a data em que a entrega foi realizada de fato para {pendingStatus === "FINALIZADO" ? "finalizar" : "marcar como entregue"}.
            </p>
          </div>
          <Input
            type="date"
            label="Data da Entrega *"
            value={dataEntregaInput}
            onChange={(e) => setDataEntregaInput(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <Button variant="ghost" onClick={() => { setShowDataEntregaPrompt(false); setPendingStatus(null); }}>Cancelar</Button>
            <Button onClick={handleConfirmDataEntrega} loading={saving || salvandoResolucao}>Confirmar</Button>
          </div>
        </div>
      </Modal>

      {/* RESOLVE OCORRENCIA MODAL */}
      <Modal open={showResolveModal} onClose={() => { setShowResolveModal(false); }} title="Resolver Ocorrência" size="md">
        <div className="space-y-4">
          <div className="p-3 rounded-xl flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
            <AlertTriangle size={18} className="flex-shrink-0" />
            <p className="text-sm">
              Ao solucionar a ocorrência, defina o status final e registre as observações da resolução (se gerou reentrega, se foi devolvida, etc.).
            </p>
          </div>

          <Select label="Status Final da Entrega" value={statusFinalEntrega} onChange={e => {
            const val = e.target.value;
            setStatusFinalEntrega(val);
            if (val === "DEVOLVIDO_FABRICA") {
              setDevolucaoData((d) => ({
                transportadora: d.transportadora,
                motorista: d.motorista || entrega?.motorista?.nome || "",
                placa: d.placa || entrega?.veiculo?.placa || "",
                dataCarregamento: d.dataCarregamento || new Date().toISOString().slice(0, 10),
              }));
            }
          }}>
            <option value="FINALIZADO">Finalizado (Cobrança normal / Reentrega faturada)</option>
            <option value="ENTREGUE">Entregue (Resolvido com o cliente no local)</option>
            <option value="EM_ROTA">Em Rota (Retomar viagem)</option>
            <option value="DEVOLVIDO_FABRICA">Devolvido à Fábrica (Retorno)</option>
          </Select>

          {statusFinalEntrega === "DEVOLVIDO_FABRICA" && (
            <div className="p-3 rounded-xl space-y-3" style={{ background: "rgba(249,115,22,.06)", border: "1px solid rgba(249,115,22,.25)" }}>
              <div className="text-xs font-mono uppercase" style={{ color: "var(--accent)" }}>
                🏭 Dados do carregamento de retorno à fábrica
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Transportadora *" value={devolucaoData.transportadora}
                  onChange={(e) => setDevolucaoData((d) => ({ ...d, transportadora: e.target.value }))}
                  placeholder="Ex: PORTO LOG" />
                <Input label="Motorista *" value={devolucaoData.motorista}
                  onChange={(e) => setDevolucaoData((d) => ({ ...d, motorista: e.target.value }))}
                  placeholder="Nome completo" />
                <Input label="Placa *" value={devolucaoData.placa}
                  onChange={(e) => setDevolucaoData((d) => ({ ...d, placa: e.target.value.toUpperCase() }))}
                  placeholder="ABC1D23" />
                <Input label="Data do carregamento *" type="date" value={devolucaoData.dataCarregamento}
                  onChange={(e) => setDevolucaoData((d) => ({ ...d, dataCarregamento: e.target.value }))} />
              </div>
            </div>
          )}

          <Textarea label={statusFinalEntrega === "DEVOLVIDO_FABRICA" ? "Observação adicional (opcional)" : "Observação da Resolução / Ocorrência Solucionada *"} rows={3} value={resolucaoTexto} onChange={e => setResolucaoTexto(e.target.value)}
            placeholder="Ex: Gerou reentrega sob NF 12345 / Devolvido ao cliente por recusa / Aguardando redespacho..." />

          <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <Button variant="ghost" onClick={() => { setShowResolveModal(false); }}>Cancelar</Button>
            <Button onClick={handleResolveOcorrencia} loading={salvandoResolucao}>Confirmar Resolução</Button>
          </div>
        </div>
      </Modal>

      <LinkMotoristaModal
        open={showLinkMotorista}
        onClose={() => setShowLinkMotorista(false)}
        entregaId={id}
        entregaCodigo={entrega.codigo}
        motoristaTelefone={entrega.motorista?.telefone}
        motoristaNome={entrega.motorista?.nome}
      />

      <AvisoEntregaModal
        open={showAvisoEntrega}
        onClose={() => setShowAvisoEntrega(false)}
        entregaId={id}
        isAdmin={isAdmin}
      />

      <SugestaoVeiculoModal
        open={showSugestao}
        onClose={() => setShowSugestao(false)}
        entregaId={id}
        onAtribuido={reloadEntrega}
      />
    </>
  );
}

function TabButton({ children, active, onClick, icon: Icon }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 
        ${active ? "border-accent text-accent" : "border-transparent text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:text-neutral-300"}`}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}

function Field({ label, value, mono, color }: { label: string; value?: string | null; mono?: boolean; color?: string }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${mono ? "font-mono text-xs" : ""}`} style={{ color: value ? (color || "var(--text)") : "var(--text3)" }}>
        {value || "—"}
      </div>
    </div>
  );
}

function NFDetailCard({ nf, onViewDanfe }: { nf: any; onViewDanfe: (notaId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasProdutos = nf?.produtos && nf.produtos.length > 0;
  const hasInfoAdicional = nf?.infAdicionais && nf.infAdicionais.trim();
  const hasEmitente = nf?.emitente && nf.emitente.razaoSocial;

  return (
    <Card className="p-0 overflow-hidden">
      {/* NF Header - always visible */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-neutral-900/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.15)" }}>
            <FileText size={18} className="text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>NF {nf?.numero}</span>
              {nf?.serie && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--surface2)", color: "var(--text3)" }}>Série {nf.serie}</span>}
            </div>
            <div className="text-xs truncate" style={{ color: "var(--text2)" }}>
              {nf?.emitenteRazao || "Fornecedor não informado"}
            </div>
          </div>

          {/* Summary stats */}
          <div className="hidden md:flex items-center gap-6 flex-shrink-0">
            <div className="text-center">
              <div className="text-[9px] font-mono uppercase text-slate-400 dark:text-neutral-500">Volumes</div>
              <div className="text-sm font-bold font-mono" style={{ color: "var(--text)" }}>{nf?.volumes || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] font-mono uppercase text-slate-400 dark:text-neutral-500">Peso</div>
              <div className="text-sm font-bold font-mono" style={{ color: "var(--text)" }}>{formatWeight(nf?.pesoBruto)}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] font-mono uppercase text-slate-400 dark:text-neutral-500">Valor NF</div>
              <div className="text-sm font-bold font-mono text-emerald-600">{formatCurrency(nf?.valorNota)}</div>
            </div>
            {hasProdutos && (
              <div className="text-center">
                <div className="text-[9px] font-mono uppercase text-slate-400 dark:text-neutral-500">Itens</div>
                <div className="text-sm font-bold font-mono" style={{ color: "var(--text)" }}>{nf?.produtos?.length}</div>
              </div>
            )}
          </div>
        </div>

        <div className="ml-3 flex-shrink-0">
          {expanded ? <ChevronUp size={16} className="text-slate-400 dark:text-neutral-500" /> : <ChevronDown size={16} className="text-slate-400 dark:text-neutral-500" />}
        </div>
      </div>

      {/* Mobile summary stats */}
      <div className="flex md:hidden items-center gap-4 px-4 pb-3 -mt-1">
        <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
          {nf?.volumes || 0} vol · {formatWeight(nf?.pesoBruto)} · {formatCurrency(nf?.valorNota)}
          {hasProdutos && ` · ${nf?.produtos?.length} itens`}
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* Left: Fornecedor + Dados da NF */}
            <div className="p-4 space-y-4" style={{ borderRight: "1px solid var(--border)" }}>
              {/* Fornecedor / Emitente */}
              {hasEmitente && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <User size={13} className="text-slate-400 dark:text-neutral-500" />
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400 dark:text-neutral-500">Fornecedor / Emitente</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Razão Social" value={nf?.emitente?.razaoSocial} />
                    {nf?.emitente?.fantasia && nf.emitente.fantasia !== "undefined" && <Field label="Nome Fantasia" value={nf.emitente.fantasia} />}
                    <Field label="CNPJ" value={formatCNPJ(nf?.emitente?.cnpj)} mono />
                    {nf?.emitente?.ie && nf.emitente.ie !== "undefined" && <Field label="Inscrição Estadual" value={nf.emitente.ie} mono />}
                    <Field label="Cidade / UF" value={`${nf?.emitente?.cidade || ""}${nf?.emitente?.uf ? ` — ${nf.emitente.uf}` : ""}`} />
                    {nf?.emitente?.endereco && nf.emitente.endereco.trim() && <Field label="Endereço" value={`${nf.emitente.endereco}${nf.emitente.bairro ? `, ${nf.emitente.bairro}` : ""}`} />}
                    {nf?.emitente?.telefone && nf.emitente.telefone !== "undefined" && <Field label="Telefone" value={nf.emitente.telefone} />}
                  </div>
                </div>
              )}

              {/* Dados gerais da NF */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={13} className="text-slate-400 dark:text-neutral-500" />
                  <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400 dark:text-neutral-500">Dados da Nota Fiscal</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Número" value={nf?.numero} mono />
                  <Field label="Série" value={nf?.serie} mono />
                  <Field label="Data Emissão" value={formatDate(nf?.dataEmissao)} mono />
                  <div className="cursor-pointer group col-span-2" onClick={(e) => { e.stopPropagation(); onViewDanfe(nf?.id); }}>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-0.5">Chave de Acesso</div>
                    <div className="text-xs font-mono font-medium text-blue-500 group-hover:text-blue-400 group-hover:underline transition-colors flex items-center gap-1.5">
                      {nf?.chaveAcesso} <FileText size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <Field label="Volumes" value={String(nf?.volumes || 0)} mono />
                  <Field label="Peso Bruto" value={formatWeight(nf?.pesoBruto)} mono />
                  <Field label="Valor Total NF" value={formatCurrency(nf?.valorNota)} color="#10b981" />
                </div>
              </div>
            </div>

            {/* Right: Products table */}
            <div className="p-4">
              {hasProdutos && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Box size={13} className="text-slate-400 dark:text-neutral-500" />
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400 dark:text-neutral-500">
                      Produtos / Serviços ({nf?.produtos?.length})
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "var(--surface2)" }}>
                          <th className="text-left px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">#</th>
                          <th className="text-left px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">Descrição</th>
                          <th className="text-left px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">NCM</th>
                          <th className="text-right px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">Qtd</th>
                          <th className="text-left px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">Un</th>
                          <th className="text-right px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">Valor Un.</th>
                          <th className="text-right px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nf?.produtos?.map((p: any, idx: number) => {
                          const qtd = typeof p?.quantidade === "number" ? p.quantidade : parseFloat(p?.quantidade || "0") || 0;
                          return (
                            <tr key={idx} style={{ borderTop: idx > 0 ? "1px solid var(--border)" : "none" }}
                              className="hover:bg-slate-50 dark:hover:bg-neutral-900/50 transition-colors">
                              <td className="px-2.5 py-2 font-mono text-slate-400 dark:text-neutral-500">{idx + 1}</td>
                              <td className="px-2.5 py-2">
                                <div className="font-medium leading-tight" style={{ color: "var(--text)" }}>{p?.descricao || "—"}</div>
                                {p?.codigo && <div className="text-[9px] font-mono text-slate-400 dark:text-neutral-500 mt-0.5">Cód: {p.codigo}</div>}
                              </td>
                              <td className="px-2.5 py-2 font-mono text-slate-500 dark:text-neutral-400">{p?.ncm || "—"}</td>
                              <td className="px-2.5 py-2 text-right font-mono" style={{ color: "var(--text)" }}>
                                {qtd % 1 === 0 ? qtd : qtd.toFixed(2)}
                              </td>
                              <td className="px-2.5 py-2 font-mono text-slate-500 dark:text-neutral-400">{p?.unidade || "—"}</td>
                              <td className="px-2.5 py-2 text-right font-mono text-slate-500 dark:text-neutral-400">
                                {formatCurrency(p?.valorUnitario)}
                              </td>
                              <td className="px-2.5 py-2 text-right font-mono font-bold text-emerald-600">
                                {formatCurrency(p?.valorTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                          <td colSpan={6} className="px-2.5 py-2 text-right text-[10px] font-bold uppercase text-slate-500 dark:text-neutral-400">Total Produtos</td>
                          <td className="px-2.5 py-2 text-right font-mono font-bold text-emerald-700">
                            {formatCurrency(nf?.produtos?.reduce((s: number, p: any) => s + (p?.valorTotal || 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {!hasProdutos && (
                <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                  <Box size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Dados de produtos não disponíveis</p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom: Additional info */}
          {hasInfoAdicional && (
            <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Info size={13} className="text-slate-400 dark:text-neutral-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400 dark:text-neutral-500">Dados Adicionais</span>
              </div>
              <div className="p-3 rounded-lg text-xs leading-relaxed whitespace-pre-wrap" style={{ background: "var(--surface2)", color: "var(--text2)", border: "1px solid var(--border)" }}>
                {nf?.infAdicionais}
              </div>
            </div>
          )}

          {nf?.infFisco && nf.infFisco.trim() && (
            <div className="px-4 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <Info size={13} className="text-slate-400 dark:text-neutral-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400 dark:text-neutral-500">Informações ao Fisco</span>
              </div>
              <div className="p-3 rounded-lg text-xs leading-relaxed whitespace-pre-wrap" style={{ background: "rgba(249,115,22,.04)", color: "var(--text2)", border: "1px solid rgba(249,115,22,.12)" }}>
                {nf.infFisco}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const TIPO_LABELS_AV: Record<string, string> = {
  AVARIA: "Avaria", FALTA: "Falta", INVERSAO: "Inversão", SOBRA: "Sobra",
  DEVOLUCAO: "Devolução", SEM_PEDIDO: "Sem Pedido",
};
const TIPO_COLORS_AV: Record<string, string> = {
  AVARIA: "#ef4444", FALTA: "#f97316", INVERSAO: "#8b5cf6", SOBRA: "#3b82f6",
  DEVOLUCAO: "#eab308", SEM_PEDIDO: "#6b7280",
};

function AvariasTab({ entregaId, entrega, isReadOnly }: { entregaId: string; entrega: any; isReadOnly?: boolean }) {
  const router = useRouter();
  const [avarias, setAvarias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandida, setExpandida] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/avarias?entregaId=${entregaId}&limit=100`)
      .then(r => r.json())
      .then(d => setAvarias(d.avarias || []))
      .finally(() => setLoading(false));
  }, [entregaId]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-widest text-slate-400 dark:text-neutral-500">{avarias.length} avaria(s) registrada(s)</span>
        <Button size="sm" onClick={() => router.push("/avarias")}>
          <AlertTriangle size={13} /> Ir para Avarias
        </Button>
      </div>

      {avarias.length === 0 ? (
        <Card>
          <div className="text-center py-8" style={{ color: "var(--text3)" }}>
            <CheckCircle2 size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">Nenhuma avaria registrada para esta entrega</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {avarias.map((a: any) => {
            const aberta = expandida === a.id;
            return (
              <Card key={a.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                    onClick={() => router.push(`/avarias/${a.id}`)}>
                    <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{a.codigo}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${TIPO_COLORS_AV[a.tipo]}15`, color: TIPO_COLORS_AV[a.tipo] }}>
                      {TIPO_LABELS_AV[a.tipo]}
                    </span>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-red-500 font-bold">{formatCurrency(a.valorPrejuizo)}</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>{formatDate(a.dataOcorrencia)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandida(aberta ? null : a.id); }}
                      className="p-1 rounded hover:opacity-70"
                      style={{ color: "var(--text3)" }}
                      title={aberta ? "Fechar anexos" : "Declaração & anexos"}
                    >
                      {aberta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>
                {a.motorista && <div className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>Motorista: {a.motorista.nome}</div>}

                {aberta && (
                  <div className="mt-3 pt-3 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-[11px]" style={{ color: "var(--text3)" }}>
                        Gere a declaração, colha a assinatura do motorista e anexe o documento escaneado aqui.
                        Use o olho em cada arquivo para liberá-lo no portal do cliente.
                      </p>
                      <Button size="sm" variant="ghost"
                        onClick={() => window.open(`/imprimir/declaracao-recebimento/${a.id}`, "_blank")}>
                        <Printer size={13} /> Gerar Declaração
                      </Button>
                    </div>
                    <AnexosCard
                      apiBase={`/api/avarias/${a.id}/anexos`}
                      tiposPermitidos={["DECLARACAO", "FOTO", "DOCUMENTO", "OUTRO"]}
                      tipoDefault="DECLARACAO"
                      titulo="Declaração & Anexos da Avaria"
                      portalToggle
                      readOnly={isReadOnly}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaletizacaoTab({ entrega }: { entrega: any }) {
  const router = useRouter();
  const [buscaProduto, setBuscaProduto] = useState("");

  // Extrair e agrupar todos os produtos de todas as notas fiscais pelo código do produto e CNPJ do fornecedor
  const produtosMap = new Map<string, any>();
  let totalCaixas = 0;

  entrega.notas?.forEach((nf: any) => {
    nf.produtos?.forEach((p: any) => {
      totalCaixas += p.quantidade || 0;
      const cleanFornecedorCnpj = String(nf.emitenteCnpj || "").replace(/\D/g, "");
      const key = `${cleanFornecedorCnpj}_${p.codigo}`;

      if (produtosMap.has(key)) {
        const existente = produtosMap.get(key);
        existente.quantidade += p.quantidade || 0;
        if (!existente.nfNumeros.includes(nf.numero)) {
          existente.nfNumeros.push(nf.numero);
        }
      } else {
        produtosMap.set(key, {
          codigo: p.codigo,
          descricao: p.descricao,
          fornecedorCnpj: nf.emitenteCnpj,
          fornecedorRazao: nf.emitenteRazao,
          quantidade: p.quantidade || 0,
          norma: p.norma,
          nfNumeros: [nf.numero]
        });
      }
    });
  });

  let totalComNorma = 0;
  let totalInteirosCarga = 0;
  let totalPontasCarga = 0;
  const todosProdutos = Array.from(produtosMap.values()).map((p) => {
    const temNorma = !!p.norma;
    if (temNorma) totalComNorma++;

    let paletesInteiros = 0;
    let sobras = 0;
    let paletesPontas = 0;
    let paletesFisicos = 0;
    let paletesEstimadosDecimal = 0;

    if (temNorma) {
      const caixasPorPalete = p.norma.quantidadeCaixasPalete || 1;
      paletesInteiros = Math.floor(p.quantidade / caixasPorPalete);
      sobras = p.quantidade % caixasPorPalete;
      paletesPontas = sobras > 0 ? 1 : 0;
      paletesFisicos = paletesInteiros + paletesPontas;
      paletesEstimadosDecimal = p.quantidade / caixasPorPalete;

      totalInteirosCarga += paletesInteiros;
      totalPontasCarga += paletesPontas;
    }

    return {
      ...p,
      paletesInteiros,
      sobras,
      paletesPontas,
      paletesFisicos,
      paletesEstimados: paletesEstimadosDecimal, // mantido pra compat externa (armazenagem)
      nfNumero: p.nfNumeros.join(", ")
    };
  });

  const totalProdutos = todosProdutos.length;
  const pctNormas = totalProdutos > 0 ? Math.round((totalComNorma / totalProdutos) * 100) : 0;
  const totalPaletesFisicosCarga = totalInteirosCarga + totalPontasCarga;

  const buscaQ = buscaProduto.trim().toLowerCase();
  const produtosFiltrados = buscaQ
    ? todosProdutos.filter((p) =>
        String(p.codigo).toLowerCase().includes(buscaQ) ||
        String(p.descricao || "").toLowerCase().includes(buscaQ)
      )
    : todosProdutos;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const dataEntregaFormatada = entrega.dataAgendada ? formatDate(entrega.dataAgendada) : "Não agendada";

    const rowsHtml = todosProdutos.map((p) => {
      const normaText = p.norma
        ? `${p.norma.lastro} x ${p.norma.altura} = ${p.norma.quantidadeCaixasPalete}`
        : "SEM NORMA";

      let paletesText = "—";
      let detalheText = "";
      if (p.norma) {
        paletesText = `${p.paletesFisicos} palete${p.paletesFisicos !== 1 ? "s" : ""}`;
        if (p.paletesInteiros > 0 && p.paletesPontas > 0) {
          detalheText = `${p.paletesInteiros} int. + 1 ponta (${p.sobras} cx)`;
        } else if (p.paletesInteiros > 0) {
          detalheText = `${p.paletesInteiros} int.`;
        } else if (p.paletesPontas > 0) {
          detalheText = `1 ponta (${p.sobras} cx)`;
        }
      }

      return `
        <tr>
          <td class="font-mono text-center">${p.nfNumero}</td>
          <td class="font-mono text-center">${p.codigo}</td>
          <td>${p.descricao || "—"}</td>
          <td class="text-center font-mono">${p.quantidade}</td>
          <td class="text-center font-mono">${normaText}</td>
          <td class="text-center font-mono font-bold">${paletesText}<br/><span style="font-size: 9px; color: #64748b; font-weight: normal;">${detalheText}</span></td>
          <td style="width: 120px;"></td> <!-- Campo para conferência manual -->
          <td style="width: 120px;"></td> <!-- Campo para observação -->
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Ficha de Conferência de Paletização - Carga ${entrega.codigo}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            body { font-family: 'Inter', sans-serif; color: #1e293b; padding: 20px; line-height: 1.4; }
            .header-container { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }
            .title-area h1 { font-size: 18px; margin: 0 0 5px 0; text-transform: uppercase; font-weight: 700; color: #0f172a; }
            .title-area p { font-size: 11px; color: #64748b; margin: 0; }
            .meta-carga { text-align: right; }
            .meta-carga h2 { font-size: 20px; margin: 0; font-weight: 700; color: #f97316; font-family: monospace; }
            .meta-carga p { font-size: 10px; color: #64748b; margin: 2px 0 0 0; text-transform: uppercase; }
            
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; }
            .info-col { display: flex; flex-direction: column; gap: 6px; }
            .info-item { font-size: 11px; }
            .info-label { font-weight: bold; color: #475569; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px; }
            th { background: #f1f5f9; font-size: 9px; text-transform: uppercase; font-weight: 700; color: #475569; padding: 8px 10px; border: 1px solid #cbd5e1; }
            td { font-size: 11px; padding: 8px 10px; border: 1px solid #cbd5e1; color: #334155; }
            .font-mono { font-family: monospace; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            
            .kpis-print { display: flex; gap: 20px; margin-bottom: 20px; }
            .kpi-print-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center; background: #fff; }
            .kpi-print-val { font-size: 18px; font-weight: bold; color: #0f172a; }
            .kpi-print-lbl { font-size: 9px; text-transform: uppercase; color: #64748b; margin-top: 2px; }

            .signature-area { display: flex; justify-content: space-between; margin-top: 50px; page-break-inside: avoid; }
            .signature-line { width: 45%; border-top: 1px solid #64748b; text-align: center; padding-top: 6px; font-size: 10px; font-weight: bold; color: #475569; }
            
            @media print {
              body { padding: 10px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="title-area">
              <h1>Ficha de Conferência & Paletização</h1>
              <p>Instruções físicas de empilhamento de produtos por norma do cliente</p>
            </div>
            <div class="meta-carga">
              <h2>${entrega.codigo}</h2>
              <p>Código da Carga</p>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-col">
              <div class="info-item"><span class="info-label">Destinatário (Cliente):</span> ${entrega.razaoSocial} (${formatCNPJ(entrega.cnpj)})</div>
              <div class="info-item"><span class="info-label">Endereço de Entrega:</span> ${entrega.endereco || "—"}, ${entrega.cidade || "—"}/${entrega.uf || "—"}</div>
              <div class="info-item"><span class="info-label">Data Agendada:</span> ${dataEntregaFormatada}</div>
            </div>
            <div class="info-col">
              <div class="info-item"><span class="info-label">Motorista:</span> ${entrega.motorista?.nome || "Não escalado"}</div>
              <div class="info-item"><span class="info-label">Veículo / Placa:</span> ${entrega.veiculo?.placa || "Não escalado"} (${entrega.veiculo?.tipo || ""})</div>
              <div class="info-item"><span class="info-label">Notas Fiscais:</span> ${entrega.notas?.map((n: any) => n.numero).join(", ") || "—"}</div>
            </div>
          </div>

          <div class="kpis-print">
            <div class="kpi-print-box">
              <div class="kpi-print-val">${totalPaletesFisicosCarga}</div>
              <div class="kpi-print-lbl">Paletes Físicos Totais</div>
              <div style="font-size: 9px; color: #64748b; margin-top: 2px;">${totalInteirosCarga} inteiros + ${totalPontasCarga} pontas</div>
            </div>
            <div class="kpi-print-box">
              <div class="kpi-print-val">${totalCaixas}</div>
              <div class="kpi-print-lbl">Total Caixas (NF)</div>
            </div>
            <div class="kpi-print-box">
              <div class="kpi-print-val">${totalComNorma} de ${totalProdutos}</div>
              <div class="kpi-print-lbl">Itens com Normas</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 60px;">NF</th>
                <th style="width: 80px;">Cód Produto</th>
                <th>Descrição do Produto</th>
                <th style="width: 60px; text-align: center;">Qtd Caixas</th>
                <th style="width: 120px; text-align: center;">Norma (L x A)</th>
                <th style="width: 110px; text-align: center;">Paletes Estimados</th>
                <th>Conf. Paletes (Assinalar)</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="signature-area">
            <div class="signature-line">Assinatura do Conferente (Pátio)</div>
            <div class="signature-line">Assinatura do Motorista</div>
          </div>

          <div class="no-print" style="margin-top: 30px; text-align: right;">
            <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px;">Imprimir Ficha</button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4">
      {/* Cards de Resumo de Paletização */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex items-center justify-between p-5 relative overflow-hidden">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 dark:text-neutral-400 mb-1">Paletes Físicos</div>
            <div className="font-head text-3xl font-black text-orange-400">
              {totalPaletesFisicosCarga}
            </div>
            <div className="text-xs text-slate-400 dark:text-neutral-500 mt-1">
              {totalInteirosCarga} inteiros + {totalPontasCarga} ponta{totalPontasCarga !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="text-4xl opacity-10">
            <Layers size={40} className="text-slate-400 dark:text-neutral-500" />
          </div>
        </Card>

        <Card className="flex items-center justify-between p-5 relative overflow-hidden">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 dark:text-neutral-400 mb-1">Total de Caixas</div>
            <div className="font-head text-3xl font-black text-emerald-400">
              {totalCaixas}
            </div>
            <div className="text-xs text-slate-400 dark:text-neutral-500 mt-1">Soma de volumes das NFs</div>
          </div>
          <div className="text-4xl opacity-10">
            <Box size={40} className="text-slate-400 dark:text-neutral-500" />
          </div>
        </Card>

        <Card className="flex items-center justify-between p-5 relative overflow-hidden">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 dark:text-neutral-400 mb-1">Itens com Normas</div>
            <div className="font-head text-3xl font-black text-blue-400">
              {totalComNorma} <span className="text-sm font-normal text-slate-500 dark:text-neutral-400">de {totalProdutos} ({pctNormas}%)</span>
            </div>
            <div className="text-xs text-slate-400 dark:text-neutral-500 mt-1">Cobertura das regras físicas</div>
          </div>
          <div className="text-4xl opacity-10">
            <ShieldCheck size={40} className="text-slate-400 dark:text-neutral-500" />
          </div>
        </Card>
      </div>

      {/* Ações da Aba */}
      <div className="flex justify-between items-center p-3 rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="text-xs text-slate-400 dark:text-neutral-500 flex items-center gap-2">
          <Info size={14} className="text-[var(--accent)]" />
          <span>Forneça esta ficha aos conferentes para guiar a montagem física no pátio.</span>
        </div>
        <Button size="sm" onClick={handlePrint}>
          <Printer size={13} /> Imprimir Ficha de Conferência
        </Button>
      </div>

      {/* Tabela de Produtos e Normas */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400 dark:text-neutral-500 font-bold">
            Listagem de Itens e Normas de Paletização
            {buscaQ && (
              <span className="ml-2 normal-case font-normal text-[10px]" style={{ color: "var(--text3)" }}>
                — {produtosFiltrados.length} de {todosProdutos.length}
              </span>
            )}
          </span>
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
            <input
              type="text"
              placeholder="Buscar por código ou nome do produto..."
              value={buscaProduto}
              onChange={(e) => setBuscaProduto(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            {buscaProduto && (
              <button
                onClick={() => setBuscaProduto("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded hover:opacity-70"
                style={{ color: "var(--text3)" }}
                title="Limpar"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>NF</Th>
                <Th>Cód Produto</Th>
                <Th>Descrição</Th>
                <Th className="text-center">Quantidade Caixas</Th>
                <Th className="text-center">Lastro x Altura</Th>
                <Th className="text-center">Qtd / Palete</Th>
                <Th className="text-center">Paletes Estimados</Th>
                <Th className="text-right">Ação</Th>
              </tr>
            </thead>
            <tbody>
              {todosProdutos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-xs text-slate-500 dark:text-neutral-400">
                    Nenhum produto extraído do XML desta entrega.
                  </td>
                </tr>
              ) : produtosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-xs text-slate-500 dark:text-neutral-400">
                    Nenhum produto encontrado para «{buscaProduto}».
                  </td>
                </tr>
              ) : (
                produtosFiltrados.map((p, idx) => {
                  const hasNorma = !!p.norma;

                  let detalhe = "";
                  if (hasNorma) {
                    if (p.paletesInteiros > 0 && p.paletesPontas > 0) {
                      detalhe = `${p.paletesInteiros} int. + 1 ponta (${p.sobras} cx)`;
                    } else if (p.paletesInteiros > 0) {
                      detalhe = `${p.paletesInteiros} int.`;
                    } else if (p.paletesPontas > 0) {
                      detalhe = `1 ponta (${p.sobras} cx)`;
                    }
                  }

                  return (
                    <Tr key={idx}>
                      <Td className="font-mono text-xs font-semibold">NF {p.nfNumero}</Td>
                      <Td className="font-mono text-xs font-semibold text-orange-400">{p.codigo}</Td>
                      <Td className="max-w-xs truncate" title={p.descricao || ""}>
                        <div className="font-medium text-slate-200">{p.descricao || "—"}</div>
                        <div className="text-[9px] text-slate-500 dark:text-neutral-400">Fornecedor: {p.fornecedorRazao}</div>
                      </Td>
                      <Td className="text-center font-mono font-semibold">{p.quantidade}</Td>
                      <Td className="text-center font-mono text-emerald-400 font-semibold">
                        {hasNorma ? `${p.norma.lastro} x ${p.norma.altura}` : "—"}
                      </Td>
                      <Td className="text-center font-mono text-orange-400 font-bold">
                        {hasNorma ? p.norma.quantidadeCaixasPalete : "—"}
                      </Td>
                      <Td className="text-center font-mono font-bold text-orange-400">
                        {hasNorma ? (
                          <div className="flex flex-col items-center">
                            <span>{p.paletesFisicos} palete{p.paletesFisicos !== 1 ? "s" : ""}</span>
                            <span className="text-[10px] text-slate-400 dark:text-neutral-500 font-normal">{detalhe}</span>
                          </div>
                        ) : (
                          <span className="text-red-400 font-normal italic text-xs">Sem norma</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        {hasNorma ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="px-2.5 py-1 text-xs"
                            onClick={() => router.push(`/configuracoes/normas?q=${p.codigo}`)}
                          >
                            Ver Norma
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            className="px-2.5 py-1 text-xs bg-orange-600 border-orange-600 hover:bg-orange-700"
                            onClick={() => router.push(`/configuracoes/normas?addManual=true&clienteCnpj=${entrega.cnpj}&fornecedorCnpj=${p.fornecedorCnpj}&codigoProduto=${p.codigo}&descricao=${encodeURIComponent(p.descricao || "")}`)}
                          >
                            Cadastrar Norma
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

