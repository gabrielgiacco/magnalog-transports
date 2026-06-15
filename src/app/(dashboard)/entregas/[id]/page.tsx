"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, StatusBadge, Modal, Input, Select, Textarea, ComboboxMotorista } from "@/components/ui";
import { formatCurrency, formatDate, formatWeight, formatCNPJ } from "@/lib/utils";
import { Copy, FileText, History, Package, MapPin, Truck, ChevronLeft, Calendar, User, Clock, CheckCircle2, AlertCircle, Trash2, ShieldCheck, DollarSign, Scissors, ChevronDown, ChevronUp, Box, Info, Weight, Layers, AlertTriangle, Printer, Maximize2, Minimize2, Plus, Search, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { QualityScoring } from "@/components/quality/QualityScoring";
import { DanfeViewer } from "@/components/danfe/DanfeViewer";
import { parseDanfeXML } from "@/lib/danfe-parser";

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
  const [showOcorrencia, setShowOcorrencia] = useState(false);
  const [motoristas, setMotoristas] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [editForm, setEditForm] = useState<any>({});
  const [ocorrForm, setOcorrForm] = useState({ tipo: "ATRASO", descricao: "" });
  const [tab, setTab] = useState("info");
  const [selectedNotas, setSelectedNotas] = useState<string[]>([]);
  const [separando, setSeparando] = useState(false);
  const [danfeModal, setDanfeModal] = useState<{ open: boolean; xml: string | null; loading: boolean; fullscreen: boolean }>({ open: false, xml: null, loading: false, fullscreen: false });
  const [showQualityPrompt, setShowQualityPrompt] = useState(false);

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolucaoTexto, setResolucaoTexto] = useState("");
  const [statusFinalEntrega, setStatusFinalEntrega] = useState("FINALIZADO");
  const [salvandoResolucao, setSalvandoResolucao] = useState(false);

  // Add NFs modal
  const [showAddNF, setShowAddNF] = useState(false);
  const [notasDisp, setNotasDisp] = useState<any[]>([]);
  const [selectedNFIds, setSelectedNFIds] = useState<string[]>([]);
  const [searchNF, setSearchNF] = useState("");
  const [addingNFs, setAddingNFs] = useState(false);

  useEffect(() => {
    fetch(`/api/entregas/${id}`).then((r) => r.json()).then((d) => { 
      setEntrega(d); 
      setEditForm(formatForEdit(d)); 
    }).finally(() => setLoading(false));
    
    fetch("/api/motoristas?ativo=true").then((r) => r.json()).then(setMotoristas);
    fetch("/api/veiculos").then((r) => r.json()).then(setVeiculos);
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
    };
  }

  async function handleStatusChange(newStatus: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/entregas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          ...(newStatus === "ENTREGUE" ? { dataEntrega: new Date().toISOString() } : {})
        }),
      });
      const updated = await res.json();
      setEntrega(updated);
      toast.success("Status atualizado");
      if (newStatus === "FINALIZADO") {
        setShowQualityPrompt(true);
      }
    } catch { toast.error("Erro ao atualizar"); }
    finally { setSaving(false); }
  }

  async function handleSaveEdit() {
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
        }),
      });
      const updated = await res.json();
      if (!res.ok) {
        throw new Error(updated.error || updated.message || "Erro retornado pelo servidor");
      }
      setEntrega(updated);
      setShowEdit(false);
      toast.success("Entrega atualizada");

      if (editForm.status === "FINALIZADO" && entrega?.status !== "FINALIZADO") {
        setShowQualityPrompt(true);
      }
    } catch (err: any) {
      console.error("Erro ao salvar entrega:", err);
      toast.error(err.message || "Erro ao salvar");
    } finally { setSaving(false); }
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
    if (!resolucaoTexto.trim()) {
      toast.error("Insira uma observação para a resolução");
      return;
    }
    setSalvandoResolucao(true);
    try {
      const ultimaOcorr = entrega.ocorrencias?.find((o: any) => !o.resolvida);
      if (!ultimaOcorr) {
        toast.error("Nenhuma ocorrência em aberto encontrada");
        return;
      }

      // 1. Atualizar a ocorrência
      const resOcorr = await fetch(`/api/entregas/${id}/ocorrencia`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocorrenciaId: ultimaOcorr.id,
          resolucao: resolucaoTexto
        })
      });

      if (!resOcorr.ok) throw new Error("Erro ao salvar resolução da ocorrência");

      // 2. Atualizar o status da entrega
      const resEntrega = await fetch(`/api/entregas/${id}`, {
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
              <Button variant="ghost" size="sm" onClick={() => { setEditForm(formatForEdit(entrega)); setShowEdit(true); }}>
                <Copy size={14} /> Editar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => window.open(`/imprimir/carta-frete/entrega/${id}`, '_blank')}>
              <Printer size={14} /> Carta Frete
            </Button>
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
            <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Fluxo Operacional</span>
            <div className="flex items-center gap-2">
              <StatusBadge status={entrega.status} />
              {entrega.qualidade?.id && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"
                  style={{ background: "rgba(234, 179, 8, 0.15)", color: "#ca8a04", border: "1px solid rgba(234, 179, 8, 0.3)" }}
                  title="Entrega possui registro de Qualidade">
                  ⭐ Avaliada
                </span>
              )}
            </div>
          </div>
          {entrega.status === "OCORRENCIA" ? (
             <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100 flex-wrap">
               <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
               <span className="text-sm text-red-600 flex-1">Esta entrega possui ocorrência registrada.{!isReadOnly && " Escolha uma ação:"}</span>
               {!isReadOnly && (
                 <div className="flex gap-2">
                   <Button size="sm" variant="ghost" className="border-red-200 text-red-700 bg-white hover:bg-red-50" onClick={handleReentrega} disabled={saving}>
                     Gerar Reentrega (Duplicar)
                   </Button>
                   <Button size="sm" variant="ghost" className="border-green-200 text-green-700 bg-white hover:bg-green-50" onClick={() => { setResolucaoTexto(""); setStatusFinalEntrega("FINALIZADO"); setShowResolveModal(true); }} disabled={saving}>
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
                      <span className={`text-[9px] font-mono text-center leading-tight ${current ? "text-orange-600 font-bold" : done ? "text-slate-400" : "text-slate-300"}`}>
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
          {isAdmin && (
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
                  <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Destinatário</span>
                </div>
                <div className="space-y-3">
                  <Field label="Razão Social" value={entrega.razaoSocial} />
                  <Field label="CNPJ" value={formatCNPJ(entrega.cnpj)} mono />
                  {entrega.notas && entrega.notas.length > 0 ? (
                    entrega.notas.map((n: any) => (
                      <div key={n.id} className="cursor-pointer group" onClick={() => handleViewDanfe(n.id)}>
                        <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400 mb-0.5">{`Chave de Acesso (NF ${n.numero})`}</div>
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
                  <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Operação</span>
                </div>
                <div className="space-y-3">
                  <Field label="Motorista" value={entrega.motorista?.nome} />
                  <Field label="Veículo" value={entrega.veiculo ? `${entrega.veiculo.placa} — ${entrega.veiculo.tipo}` : "—"} />
                  <Field label="Rota" value={entrega.rota?.codigo} mono />
                  <Field label="Paletes" value={entrega.quantidadePaletes > 0 ? String(entrega.quantidadePaletes) : "—"} />
                  <Field label="Data Chegada" value={formatDate(entrega.dataChegada)} mono />
                  <Field label="Data Agendada" value={formatDate(entrega.dataAgendada)} mono />
                  <Field label="Data Entrega" value={formatDate(entrega.dataEntrega)} mono />
                </div>
              </Card>

              {/* Financeiro */}
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign size={14} className="text-emerald-500" />
                  <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Financeiro</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100">
                    <span className="text-[10px] font-bold">RECEITA CLIENTE</span>
                    <span className="font-mono text-xs">{formatCurrency(entrega.valorFrete)}</span>
                  </div>
                  {entrega.armazenagemCalc ? (
                    <>
                      <div className="flex justify-between items-center bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg border border-amber-100">
                        <span className="text-[10px] font-bold">ARMAZENAGEM {entrega.armazenagemCalc?.emAberto ? "(em curso)" : ""}</span>
                        <span className="font-mono text-xs">{formatCurrency(entrega.armazenagemCalc?.valorTotal)}</span>
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text3)" }}>
                        {entrega.armazenagemCalc?.diasDecorridos} dia(s) · {entrega.quantidadePaletes || 0} palete(s)
                      </div>
                      {entrega.armazenagemCalc?.fornecedores?.map((f: any) => (
                        <div key={f.cnpjFornecedor || f.cnpjCliente} className="text-[9px] font-mono pl-2 border-l-2 border-amber-200" style={{ color: "var(--text3)" }}>
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
                  <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">Custo Motorista (Terceiro)</div>
                  <Field label="Valor Combinado" value={formatCurrency(entrega.valorMotorista)} color="#f97316" />
                  <Field label="Saldo a Pagar" value={formatCurrency(entrega.saldoMotorista)} color={entrega.saldoMotorista > 0 ? "#f97316" : "#10b981"} />
                  <StatusBadge status={entrega.statusCanhoto} />
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
                    <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Carga</span>
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
                              ? "bg-orange-50 border-orange-300 ring-1 ring-orange-200"
                              : "bg-slate-50 border-slate-100"
                          } ${!isReadOnly && entrega.notas.length > 1 ? "cursor-pointer hover:border-orange-200" : ""}`}>
                          {!isReadOnly && entrega.notas.length > 1 && (
                            <input type="checkbox" checked={selected} readOnly
                              className="accent-orange-500 w-4 h-4 flex-shrink-0 pointer-events-none" />
                          )}
                          <FileText size={13} className="text-slate-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold">NF {nf.numero}</div>
                            <div className="text-[10px] font-mono truncate text-slate-500">{nf.emitenteRazao}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono text-emerald-600 font-bold">{formatCurrency(nf.valorNota)}</div>
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
                  <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Ocorrências</span>
                </div>
                {entrega.ocorrencias?.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <CheckCircle2 size={24} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Nenhuma ocorrência registrada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entrega.ocorrencias?.map((oc: any) => (
                      <div key={oc.id} className="p-3 rounded-lg bg-red-50 border border-red-100">
                         <div className="flex items-center justify-between mb-1">
                           <span className="text-xs font-bold text-red-600">{oc.tipo}</span>
                           <div className="flex items-center gap-1.5">
                             <span className="text-[10px] text-slate-400">{formatDate(oc.createdAt)}</span>
                             <button
                               onClick={() => router.push("/avarias?tab=ocorrencias")}
                               className="p-1 px-1.5 rounded bg-white text-red-600 hover:bg-red-50 transition-all flex items-center gap-1 text-[9px] font-bold border border-red-200"
                               title="Ver Painel de Ocorrências"
                             >
                               Ver Painel <ExternalLink size={9} />
                             </button>
                           </div>
                         </div>
                         <p className="text-xs text-slate-600">{oc.descricao}</p>
                      </div>
                    ))}
                  </div>
                )}
             </Card>
          </div>
        )}

        {tab === "avarias" && (
          <AvariasTab entregaId={id} entrega={entrega} />
        )}

        {tab === "qualidade" && isAdmin && (
          <Card>
            <div className="flex items-center gap-2 mb-6">
              <ShieldCheck className="text-accent" />
              <h2 className="text-lg font-bold">Avaliação de Qualidade Operacional</h2>
            </div>
            <QualityScoring entregaId={id} />
          </Card>
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
            <div className="col-span-2 py-2 border-b text-[10px] font-bold text-slate-400 uppercase">Valores</div>
            <Input label="Valor Frete Cliente" type="number" value={editForm.valorFrete} onChange={(e) => set("valorFrete", e.target.value)} />
            <Input label="Valor Combinado Motorista" type="number" value={editForm.valorMotorista} onChange={(e) => set("valorMotorista", e.target.value)} />
            <Textarea label="Observações" value={editForm.observacoes} onChange={(e) => set("observacoes", e.target.value)} className="col-span-2" />
         </div>
         <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} loading={saving}>Salvar Alterações</Button>
         </div>
      </Modal>

      {/* Quality Prompt Modal */}
      <Modal open={showQualityPrompt} onClose={() => setShowQualityPrompt(false)} title="Avaliação de Qualidade Operacional" size="lg">
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
                    const el = document.getElementById("danfe-print");
                    if (!el) return;
                    const win = window.open("", "_blank");
                    if (!win) return;
                    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((s) => s.outerHTML).join("");
                    win.document.write(`<html><head>${styles}</head><body style="padding:10px">${el.outerHTML}</body></html>`);
                    win.document.close();
                    win.onload = () => { win.print(); };
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Imprimir"
                >
                  <Printer size={16} className="text-slate-500" />
                </button>
                <button
                  onClick={() => setDanfeModal((prev) => ({ ...prev, fullscreen: !prev.fullscreen }))}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title={danfeModal.fullscreen ? "Reduzir" : "Ampliar"}
                >
                  {danfeModal.fullscreen ? <Minimize2 size={16} className="text-slate-500" /> : <Maximize2 size={16} className="text-slate-500" />}
                </button>
                <button
                  onClick={() => setDanfeModal({ open: false, xml: null, loading: false, fullscreen: false })}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Fechar"
                >
                  <span className="text-slate-500 text-lg leading-none">&times;</span>
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
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por número NF, emitente, CNPJ..."
              value={searchNF}
              onChange={(e) => setSearchNF(e.target.value)}
              className="pl-9"
            />
          </div>

          {filteredNotasDisp.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={filteredNotasDisp.length > 0 && filteredNotasDisp.every(n => selectedNFIds.includes(n.id))}
                  onChange={toggleAllNFs}
                  className="accent-orange-500 w-4 h-4"
                />
                Selecionar todos ({filteredNotasDisp.length})
              </label>
              <span className="text-xs text-slate-500">
                {selectedNFIds.length} selecionada(s)
              </span>
            </div>
          )}

          <div className="max-h-[50vh] overflow-y-auto border rounded-lg" style={{ borderColor: "var(--border)" }}>
            {filteredNotasDisp.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
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
                        selected ? "bg-orange-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        readOnly
                        className="accent-orange-500 w-4 h-4 flex-shrink-0 pointer-events-none"
                      />
                      <FileText size={14} className="text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">NF {nf.numero}</span>
                          {nf.emitenteCnpj && (
                            <span className="text-[10px] font-mono text-slate-400">{formatCNPJ(nf.emitenteCnpj)}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{nf.emitenteRazao}</div>
                        <div className="text-[10px] text-slate-400 truncate">→ {nf.destinatarioRazao}</div>
                        {nf.entrega && (
                          <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
                            ⚠ Vinculada a {nf.entrega.codigo} — será movida
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-mono text-emerald-600 font-bold">{formatCurrency(nf.valorNota)}</div>
                        <div className="text-[10px] text-slate-400">
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

      {/* RESOLVE OCORRENCIA MODAL */}
      <Modal open={showResolveModal} onClose={() => { setShowResolveModal(false); }} title="Resolver Ocorrência" size="md">
        <div className="space-y-4">
          <div className="p-3 rounded-xl flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
            <AlertTriangle size={18} className="flex-shrink-0" />
            <p className="text-sm">
              Ao solucionar a ocorrência, defina o status final e registre as observações da resolução (se gerou reentrega, se foi devolvida, etc.).
            </p>
          </div>

          <Select label="Status Final da Entrega" value={statusFinalEntrega} onChange={e => setStatusFinalEntrega(e.target.value)}>
            <option value="FINALIZADO">Finalizado (Cobrança normal / Reentrega faturada)</option>
            <option value="ENTREGUE">Entregue (Resolvido com o cliente no local)</option>
            <option value="EM_ROTA">Em Rota (Retomar viagem)</option>
          </Select>

          <Textarea label="Observação da Resolução / Ocorrência Solucionada *" rows={3} value={resolucaoTexto} onChange={e => setResolucaoTexto(e.target.value)}
            placeholder="Ex: Gerou reentrega sob NF 12345 / Devolvido ao cliente por recusa / Aguardando redespacho..." />

          <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <Button variant="ghost" onClick={() => { setShowResolveModal(false); }}>Cancelar</Button>
            <Button onClick={handleResolveOcorrencia} loading={salvandoResolucao}>Confirmar Resolução</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function TabButton({ children, active, onClick, icon: Icon }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 
        ${active ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-slate-600"}`}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}

function Field({ label, value, mono, color }: { label: string; value?: string | null; mono?: boolean; color?: string }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400 mb-0.5">{label}</div>
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
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
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
              <div className="text-[9px] font-mono uppercase text-slate-400">Volumes</div>
              <div className="text-sm font-bold font-mono" style={{ color: "var(--text)" }}>{nf?.volumes || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] font-mono uppercase text-slate-400">Peso</div>
              <div className="text-sm font-bold font-mono" style={{ color: "var(--text)" }}>{formatWeight(nf?.pesoBruto)}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] font-mono uppercase text-slate-400">Valor NF</div>
              <div className="text-sm font-bold font-mono text-emerald-600">{formatCurrency(nf?.valorNota)}</div>
            </div>
            {hasProdutos && (
              <div className="text-center">
                <div className="text-[9px] font-mono uppercase text-slate-400">Itens</div>
                <div className="text-sm font-bold font-mono" style={{ color: "var(--text)" }}>{nf?.produtos?.length}</div>
              </div>
            )}
          </div>
        </div>

        <div className="ml-3 flex-shrink-0">
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
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
                    <User size={13} className="text-slate-400" />
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400">Fornecedor / Emitente</span>
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
                  <FileText size={13} className="text-slate-400" />
                  <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400">Dados da Nota Fiscal</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Número" value={nf?.numero} mono />
                  <Field label="Série" value={nf?.serie} mono />
                  <Field label="Data Emissão" value={formatDate(nf?.dataEmissao)} mono />
                  <div className="cursor-pointer group col-span-2" onClick={(e) => { e.stopPropagation(); onViewDanfe(nf?.id); }}>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400 mb-0.5">Chave de Acesso</div>
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
                    <Box size={13} className="text-slate-400" />
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400">
                      Produtos / Serviços ({nf?.produtos?.length})
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "var(--surface2)" }}>
                          <th className="text-left px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">#</th>
                          <th className="text-left px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Descrição</th>
                          <th className="text-left px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">NCM</th>
                          <th className="text-right px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Qtd</th>
                          <th className="text-left px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Un</th>
                          <th className="text-right px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Valor Un.</th>
                          <th className="text-right px-2.5 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nf?.produtos?.map((p: any, idx: number) => {
                          const qtd = typeof p?.quantidade === "number" ? p.quantidade : parseFloat(p?.quantidade || "0") || 0;
                          return (
                            <tr key={idx} style={{ borderTop: idx > 0 ? "1px solid var(--border)" : "none" }}
                              className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-2.5 py-2 font-mono text-slate-400">{idx + 1}</td>
                              <td className="px-2.5 py-2">
                                <div className="font-medium leading-tight" style={{ color: "var(--text)" }}>{p?.descricao || "—"}</div>
                                {p?.codigo && <div className="text-[9px] font-mono text-slate-400 mt-0.5">Cód: {p.codigo}</div>}
                              </td>
                              <td className="px-2.5 py-2 font-mono text-slate-500">{p?.ncm || "—"}</td>
                              <td className="px-2.5 py-2 text-right font-mono" style={{ color: "var(--text)" }}>
                                {qtd % 1 === 0 ? qtd : qtd.toFixed(2)}
                              </td>
                              <td className="px-2.5 py-2 font-mono text-slate-500">{p?.unidade || "—"}</td>
                              <td className="px-2.5 py-2 text-right font-mono text-slate-500">
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
                          <td colSpan={6} className="px-2.5 py-2 text-right text-[10px] font-bold uppercase text-slate-500">Total Produtos</td>
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
                <div className="text-center py-8 text-slate-400">
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
                <Info size={13} className="text-slate-400" />
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400">Dados Adicionais</span>
              </div>
              <div className="p-3 rounded-lg text-xs leading-relaxed whitespace-pre-wrap" style={{ background: "var(--surface2)", color: "var(--text2)", border: "1px solid var(--border)" }}>
                {nf?.infAdicionais}
              </div>
            </div>
          )}

          {nf?.infFisco && nf.infFisco.trim() && (
            <div className="px-4 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <Info size={13} className="text-slate-400" />
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400">Informações ao Fisco</span>
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

function AvariasTab({ entregaId, entrega }: { entregaId: string; entrega: any }) {
  const router = useRouter();
  const [avarias, setAvarias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        <span className="text-xs font-mono uppercase tracking-widest text-slate-400">{avarias.length} avaria(s) registrada(s)</span>
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
          {avarias.map((a: any) => (
            <Card key={a.id} className="p-3 cursor-pointer hover:shadow-md transition-all"
              onClick={() => router.push(`/avarias/${a.id}`)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{a.codigo}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${TIPO_COLORS_AV[a.tipo]}15`, color: TIPO_COLORS_AV[a.tipo] }}>
                    {TIPO_LABELS_AV[a.tipo]}
                  </span>
                  <StatusBadge status={a.status} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-red-500 font-bold">{formatCurrency(a.valorPrejuizo)}</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>{formatDate(a.dataOcorrencia)}</span>
                </div>
              </div>
              {a.motorista && <div className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>Motorista: {a.motorista.nome}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
