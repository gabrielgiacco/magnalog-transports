"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, StatusBadge, Modal, Select, Textarea } from "@/components/ui";
import { formatCurrency, formatDate, formatCNPJ, formatCPF } from "@/lib/utils";
import {
  ChevronLeft, AlertTriangle, Package, MapPin, User, Truck, FileText,
  CheckCircle2, Clock, XCircle, Upload, Eye, ChevronDown, ChevronUp, Box, Info, Weight, LogOut, Square, CheckSquare, Trash2,
} from "lucide-react";
import { formatWeight } from "@/lib/utils";
import toast from "react-hot-toast";
import { AnexosCard } from "@/components/entrega/AnexosCard";

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

const STATUS_FLOW = [
  { key: "PENDENTE", label: "Pendente", icon: Clock },
  { key: "EM_ANALISE", label: "Em Análise", icon: Eye },
  { key: "RESOLVIDA", label: "Resolvida", icon: CheckCircle2 },
];

export default function AvariaDetailPage() {
  const params = useParams()!;
  const id = params.id as string;
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [avaria, setAvaria] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showResolve, setShowResolve] = useState(false);
  const [showDevStatus, setShowDevStatus] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [resolucao, setResolucao] = useState("");
  const [devForm, setDevForm] = useState({ status: "DEVOLVIDO_CLIENTE", responsavel: "", observacoes: "" });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedDevs, setSelectedDevs] = useState<string[]>([]);
  const [showSaida, setShowSaida] = useState(false);
  const [saidaForm, setSaidaForm] = useState({ motorista: "", placa: "", transportadora: "", observacoes: "" });

  useEffect(() => {
    fetch(`/api/avarias/${id}`).then(r => r.json()).then(d => {
      setAvaria(d);
      setResolucao(d.resolucao || "");
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleStatusChange(newStatus: string) {
    setSaving(true);
    try {
      const body: any = { status: newStatus };
      if (newStatus === "RESOLVIDA") body.resolucao = resolucao;
      const res = await fetch(`/api/avarias/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const updated = await res.json();
      setAvaria(updated);
      setShowResolve(false);
      toast.success("Status atualizado");
    } catch { toast.error("Erro ao atualizar"); }
    finally { setSaving(false); }
  }

  async function handleUploadDevolucao(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of Array.from(files)) formData.append("files", f);
      const res = await fetch(`/api/avarias/${id}/devolucao`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.importadas > 0) toast.success(`${data.importadas} NF(s) de devolução importada(s)`);
      if (data.duplicadas > 0) toast.error(`${data.duplicadas} duplicada(s)`);
      // Reload
      const updated = await fetch(`/api/avarias/${id}`).then(r => r.json());
      setAvaria(updated);
    } catch { toast.error("Erro ao importar"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handleDevStatusUpdate() {
    if (!showDevStatus) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/avarias/${id}/devolucao`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devolucaoId: showDevStatus.id, ...devForm }),
      });
      if (!res.ok) throw new Error();
      toast.success("Status da devolução atualizado");
      const updated = await fetch(`/api/avarias/${id}`).then(r => r.json());
      setAvaria(updated);
      setShowDevStatus(null);
    } catch { toast.error("Erro ao atualizar"); }
    finally { setSaving(false); }
  }

  async function handleDeleteDev(devId: string) {
    if (!confirm("Excluir esta NF de devolução da ocorrência? Esta ação não pode ser desfeita.")) return;
    try {
      const res = await fetch(`/api/avarias/${id}/devolucao?devolucaoId=${devId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("NF excluída");
      setSelectedDevs(prev => prev.filter(x => x !== devId));
      const updated = await fetch(`/api/avarias/${id}`).then(r => r.json());
      setAvaria(updated);
    } catch { toast.error("Erro ao excluir"); }
  }

  function toggleDev(devId: string) {
    setSelectedDevs(prev => prev.includes(devId) ? prev.filter(x => x !== devId) : [...prev, devId]);
  }

  function toggleAllDevs() {
    const pendentes = (avaria?.devolucoes || []).filter((d: any) => d.status === "PENDENTE").map((d: any) => d.id);
    const allSelected = pendentes.every((id: string) => selectedDevs.includes(id));
    setSelectedDevs(allSelected ? [] : pendentes);
  }

  async function handleDarSaida() {
    if (selectedDevs.length === 0) { toast.error("Selecione ao menos uma NF"); return; }
    setSaving(true);
    try {
      const obs = [
        saidaForm.transportadora && `Transportadora: ${saidaForm.transportadora}`,
        saidaForm.motorista && `Motorista: ${saidaForm.motorista}`,
        saidaForm.placa && `Placa: ${saidaForm.placa}`,
        saidaForm.observacoes,
      ].filter(Boolean).join(" | ");

      for (const devId of selectedDevs) {
        await fetch(`/api/avarias/${id}/devolucao`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ devolucaoId: devId, status: "RETIRADO", responsavel: saidaForm.motorista || saidaForm.transportadora, observacoes: obs }),
        });
      }
      toast.success(`${selectedDevs.length} NF(s) marcada(s) como retirada(s)`);
      setShowSaida(false);
      setSelectedDevs([]);
      setSaidaForm({ motorista: "", placa: "", transportadora: "", observacoes: "" });
      const updated = await fetch(`/api/avarias/${id}`).then(r => r.json());
      setAvaria(updated);
    } catch { toast.error("Erro ao dar saída"); }
    finally { setSaving(false); }
  }

  if (loading) return <><Topbar title="Avaria" /><Loading /></>;
  if (!avaria || avaria.error) return <><Topbar title="Não encontrada" /><div className="p-8 text-center" style={{ color: "var(--text3)" }}>Avaria não encontrada.</div></>;

  const currentIdx = STATUS_FLOW.findIndex(s => s.key === avaria.status);
  const isDescartada = avaria.status === "DESCARTADA";

  return (
    <>
      <Topbar title={avaria.codigo} subtitle={`${TIPO_LABELS[avaria.tipo]} — ${FASE_LABELS[avaria.fase]}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}><ChevronLeft size={14} /> Voltar</Button>
            {avaria.status !== "RESOLVIDA" && avaria.status !== "DESCARTADA" && (
              <Button size="sm" onClick={() => setShowResolve(true)}>Resolver / Atualizar</Button>
            )}
            {isAdmin && avaria.status !== "DESCARTADA" && avaria.status !== "RESOLVIDA" && (
              <Button variant="danger" size="sm" onClick={() => handleStatusChange("DESCARTADA")}>Descartar</Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
        {/* Status Flow */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Status</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${TIPO_COLORS[avaria.tipo]}15`, color: TIPO_COLORS[avaria.tipo], border: `1px solid ${TIPO_COLORS[avaria.tipo]}30` }}>
                {TIPO_LABELS[avaria.tipo]}
              </span>
              <StatusBadge status={avaria.status} />
            </div>
          </div>
          {isDescartada ? (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(107,114,128,.05)", border: "1px solid rgba(107,114,128,.15)" }}>
              <XCircle size={16} className="text-slate-400" />
              <span className="text-sm text-slate-500">Esta avaria foi descartada.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {STATUS_FLOW.map((s, i) => {
                const done = i < currentIdx;
                const current = i === currentIdx;
                const next = i === currentIdx + 1;
                const Icon = s.icon;
                return (
                  <div key={s.key} className="flex items-center gap-2 flex-1">
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <button onClick={() => next && (s.key === "RESOLVIDA" ? setShowResolve(true) : handleStatusChange(s.key))}
                        disabled={saving || (!next && !current)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${current ? "ring-2 ring-orange-400 scale-110" : ""} ${next ? "cursor-pointer hover:scale-110" : done ? "" : "opacity-30 cursor-not-allowed"}`}
                        style={{ background: done || current ? "var(--accent)" : "var(--surface2)", border: current ? "2px solid var(--accent)" : "1px solid var(--border)" }}>
                        {done ? <CheckCircle2 size={18} color="#fff" /> : <Icon size={16} style={{ color: current ? "#fff" : "var(--text3)" }} />}
                      </button>
                      <span className={`text-[9px] font-mono text-center leading-tight ${current ? "text-orange-600 font-bold" : done ? "text-slate-400" : "text-slate-300"}`}>{s.label}</span>
                    </div>
                    {i < STATUS_FLOW.length - 1 && <div className="h-px flex-none w-4" style={{ background: i < currentIdx ? "var(--accent)" : "var(--border)" }} />}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Detalhes */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={14} style={{ color: TIPO_COLORS[avaria.tipo] }} />
              <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Detalhes</span>
            </div>
            <div className="space-y-3">
              <Field label="Tipo" value={TIPO_LABELS[avaria.tipo]} color={TIPO_COLORS[avaria.tipo]} />
              <Field label="Fase" value={FASE_LABELS[avaria.fase]} />
              <Field label="Data da Ocorrência" value={formatDate(avaria.dataOcorrencia)} mono />
              {avaria.localOcorrencia && <Field label="Local" value={avaria.localOcorrencia} />}
              <Field label="Registrado por" value={avaria.registradoPor?.name} />
              <Field label="Data Registro" value={formatDate(avaria.createdAt)} mono />
            </div>
          </Card>

          {/* Vínculos */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Truck size={14} className="text-accent" />
              <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Vínculos</span>
            </div>
            <div className="space-y-3">
              {avaria.entrega ? (
                <div className="p-2.5 rounded-lg cursor-pointer hover:shadow-sm transition-all" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
                  onClick={() => router.push(`/entregas/${avaria.entrega.id}`)}>
                  <div className="text-xs font-semibold">{avaria.entrega.razaoSocial}</div>
                  <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{avaria.entrega.codigo} · {avaria.entrega.cidade}</div>
                </div>
              ) : <Field label="Entrega" value={null} />}
              {avaria.notaFiscal && <Field label="Nota Fiscal" value={`NF ${avaria.notaFiscal.numero} — ${avaria.notaFiscal.emitenteRazao}`} />}
              {/* Quem entrega a mercadoria e motorista de terceiro e nao tem
                  cadastro no TMS: o nome digitado na declaracao vence o
                  vinculo. Mesma ordem de fallback da impressao, para a tela
                  nunca mostrar um motorista diferente do que sai no papel. */}
              <Field
                label="Motorista"
                value={avaria.motoristaChegada || avaria.motorista?.nome || avaria.entrega?.motorista?.nome}
              />
              {(avaria.motoristaCpfChegada || avaria.motorista?.cpf || avaria.entrega?.motorista?.cpf) && (
                <Field label="CPF Motorista" mono
                  value={formatCPF(String(avaria.motoristaCpfChegada || avaria.motorista?.cpf || avaria.entrega?.motorista?.cpf))} />
              )}
              {avaria.motorista?.telefone && <Field label="Tel. Motorista" value={avaria.motorista.telefone} mono />}
              {avaria.transportadoraChegada && <Field label="Transportadora" value={avaria.transportadoraChegada} />}
              {(avaria.placaChegada || avaria.entrega?.veiculo?.placa) && (
                <Field label="Placa" mono value={avaria.placaChegada || avaria.entrega?.veiculo?.placa} />
              )}
              {avaria.dataChegada && <Field label="Data de Chegada" value={formatDate(avaria.dataChegada)} mono />}
              {avaria.rota && <Field label="Rota" value={avaria.rota.codigo} mono />}
            </div>
          </Card>

          {/* Financeiro */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Package size={14} className="text-red-500" />
              <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Prejuízo</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-100">
                <span className="text-[10px] font-bold">VALOR TOTAL</span>
                <span className="text-lg font-bold font-mono">{formatCurrency(avaria.valorPrejuizo)}</span>
              </div>
              <Field label="Produtos Afetados" value={`${avaria.produtos?.length || 0} item(ns)`} />
              <Field label="NFs Devolução" value={`${avaria.devolucoes?.length || 0}`} />
              {avaria.resolucao && (
                <div className="mt-3 p-3 rounded-lg" style={{ background: "rgba(16,185,129,.05)", border: "1px solid rgba(16,185,129,.15)" }}>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-emerald-500 mb-1">Resolução</div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>{avaria.resolucao}</p>
                  {avaria.resolvidoPor && <div className="text-[10px] mt-2 text-slate-400">por {avaria.resolvidoPor.name} em {formatDate(avaria.dataResolucao)}</div>}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Descrição */}
        <Card>
          <h3 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">Descrição da Ocorrência</h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>{avaria.descricao}</p>
          {avaria.observacoes && (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-1">Observações</h4>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text2)" }}>{avaria.observacoes}</p>
            </div>
          )}
        </Card>

        {/* Produtos Afetados */}
        {avaria.produtos?.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <Package size={14} className="text-red-500" />
              <span className="text-xs font-mono uppercase tracking-widest text-slate-400">Produtos Afetados ({avaria.produtos.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--surface2)" }}>
                    <th className="text-left px-3 py-2 text-[9px] font-bold uppercase text-slate-400">Produto</th>
                    <th className="text-left px-3 py-2 text-[9px] font-bold uppercase text-slate-400">NCM</th>
                    <th className="text-right px-3 py-2 text-[9px] font-bold uppercase text-slate-400">Qtd NF</th>
                    <th className="text-right px-3 py-2 text-[9px] font-bold uppercase text-slate-400">Qtd Avaria</th>
                    <th className="text-right px-3 py-2 text-[9px] font-bold uppercase text-slate-400">Valor Un.</th>
                    <th className="text-right px-3 py-2 text-[9px] font-bold uppercase text-slate-400">Prejuízo</th>
                  </tr>
                </thead>
                <tbody>
                  {avaria.produtos.map((p: any) => (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.descricao}</div>
                        <div className="text-[9px] font-mono text-slate-400">Cód: {p.codigoProduto}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500">{p.ncm || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.quantidadeNF}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-red-500">{p.quantidadeAvaria}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">{formatCurrency(p.valorUnitario)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-red-600">{formatCurrency(p.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                    <td colSpan={5} className="px-3 py-2 text-right text-[10px] font-bold uppercase text-slate-500">Total Prejuízo</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-red-700">{formatCurrency(avaria.produtos.reduce((s: number, p: any) => s + p.valorTotal, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        {/* NFs de Devolução */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-amber-500" />
              <span className="text-xs font-mono uppercase tracking-widest text-slate-400">NFs de Devolução ({avaria.devolucoes?.length || 0})</span>
            </div>
            <div className="flex items-center gap-2">
              {selectedDevs.length > 0 && (
                <Button size="sm" onClick={() => { setShowSaida(true); setSaidaForm({ motorista: "", placa: "", transportadora: "", observacoes: "" }); }}>
                  <LogOut size={13} /> Dar Saída ({selectedDevs.length})
                </Button>
              )}
              <input ref={fileRef} type="file" accept=".xml" multiple className="hidden" onChange={handleUploadDevolucao} />
              <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} loading={uploading}>
                <Upload size={13} /> Importar XML
              </Button>
            </div>
          </div>

          {avaria.devolucoes?.length === 0 ? (
            <div className="text-center py-8 px-4" style={{ color: "var(--text3)" }}>
              <FileText size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhuma NF de devolução anexada</p>
              <p className="text-[10px] mt-1">Importe XMLs de notas de devolução recebidas dos parceiros</p>
            </div>
          ) : (
            <div>
              {/* Select all bar */}
              {avaria.devolucoes.some((d: any) => d.status === "PENDENTE") && (
                <div className="flex items-center gap-3 px-4 py-2" style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  <button onClick={toggleAllDevs} className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text2)" }}>
                    {avaria.devolucoes.filter((d: any) => d.status === "PENDENTE").every((d: any) => selectedDevs.includes(d.id))
                      ? <CheckSquare size={16} className="text-orange-500" />
                      : <Square size={16} className="text-slate-400" />
                    }
                    Selecionar todas pendentes
                  </button>
                </div>
              )}
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {avaria.devolucoes.map((d: any) => (
                  <NFDevCard key={d.id} dev={d} selected={selectedDevs.includes(d.id)} onToggle={() => toggleDev(d.id)}
                    onUpdateStatus={() => { setShowDevStatus(d); setDevForm({ status: "DEVOLVIDO_CLIENTE", responsavel: "", observacoes: "" }); }}
                    onDelete={() => handleDeleteDev(d.id)} />
                ))}
              </div>
            </div>
          )}
        </Card>

        <AnexosCard
          apiBase={`/api/avarias/${id}/anexos`}
          tiposPermitidos={["DECLARACAO", "FOTO", "DOCUMENTO", "OUTRO"]}
          tipoDefault="FOTO"
          titulo="Fotos & Documentos da Avaria"
          portalToggle
        />
      </div>

      {/* Saída Modal */}
      <Modal open={showSaida} onClose={() => setShowSaida(false)} title={`Dar Saída — ${selectedDevs.length} NF(s)`} size="md">
        <div className="space-y-4">
          <div className="p-3 rounded-xl flex items-center gap-3" style={{ background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.2)" }}>
            <LogOut size={18} className="text-orange-500 flex-shrink-0" />
            <p className="text-sm" style={{ color: "var(--text2)" }}>
              Registre os dados de quem retirou a mercadoria para controle interno.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Transportadora</label>
              <input value={saidaForm.transportadora} onChange={e => setSaidaForm(f => ({ ...f, transportadora: e.target.value }))}
                placeholder="Nome da transportadora..." className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Motorista</label>
              <input value={saidaForm.motorista} onChange={e => setSaidaForm(f => ({ ...f, motorista: e.target.value }))}
                placeholder="Nome do motorista..." className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Placa do Veículo</label>
              <input value={saidaForm.placa} onChange={e => setSaidaForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                placeholder="ABC-1234" className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Observações</label>
            <textarea value={saidaForm.observacoes} onChange={e => setSaidaForm(f => ({ ...f, observacoes: e.target.value }))}
              placeholder="Informações adicionais sobre a retirada..." rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>

          {/* Selected NFs preview */}
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-3 py-2 text-[10px] font-mono uppercase font-bold" style={{ background: "var(--surface2)", color: "var(--text3)" }}>
              NFs selecionadas para saída
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {avaria?.devolucoes?.filter((d: any) => selectedDevs.includes(d.id)).map((d: any) => (
                <div key={d.id} className="px-3 py-2 flex items-center justify-between text-xs">
                  <span className="font-mono font-bold" style={{ color: "#3b82f6" }}>NF {d.numero}</span>
                  <span className="font-mono" style={{ color: "#10b981" }}>{formatCurrency(d.valorNota)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowSaida(false)}>Cancelar</Button>
          <Button onClick={handleDarSaida} loading={saving}>Confirmar Saída</Button>
        </div>
      </Modal>

      {/* Resolve Modal */}
      <Modal open={showResolve} onClose={() => setShowResolve(false)} title="Resolver / Atualizar Avaria" size="sm">
        <div className="space-y-4">
          <Select label="Novo Status" value={avaria?.status === "PENDENTE" ? "EM_ANALISE" : "RESOLVIDA"}
            onChange={() => {}}>
            {avaria?.status === "PENDENTE" && <option value="EM_ANALISE">Em Análise</option>}
            <option value="RESOLVIDA">Resolvida</option>
          </Select>
          <Textarea label="Resolução / Ação Tomada" rows={4} value={resolucao} onChange={e => setResolucao(e.target.value)}
            placeholder="Descreva como foi resolvido, ação tomada, responsável..." />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowResolve(false)}>Cancelar</Button>
          {avaria?.status === "PENDENTE" && (
            <Button variant="ghost" onClick={() => { handleStatusChange("EM_ANALISE"); }} loading={saving}>Mover para Análise</Button>
          )}
          <Button onClick={() => { handleStatusChange("RESOLVIDA"); }} loading={saving}>Marcar Resolvida</Button>
        </div>
      </Modal>

      {/* Devolucao Status Modal */}
      <Modal open={!!showDevStatus} onClose={() => setShowDevStatus(null)} title="Atualizar Status da Devolução" size="sm">
        <div className="space-y-4">
          <Select label="Novo Status" value={devForm.status} onChange={e => setDevForm(f => ({ ...f, status: e.target.value }))}>
            <option value="DEVOLVIDO_CLIENTE">Devolvido ao Cliente</option>
            <option value="RETIRADO">Retirado</option>
            <option value="DESCARTADO">Descartado</option>
          </Select>
          <input value={devForm.responsavel} onChange={e => setDevForm(f => ({ ...f, responsavel: e.target.value }))}
            placeholder="Responsável pela ação..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <Textarea label="Observações" rows={2} value={devForm.observacoes} onChange={e => setDevForm(f => ({ ...f, observacoes: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowDevStatus(null)}>Cancelar</Button>
          <Button onClick={handleDevStatusUpdate} loading={saving}>Confirmar</Button>
        </div>
      </Modal>
    </>
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

function NFDevCard({ dev, selected, onToggle, onUpdateStatus, onDelete }: { dev: any; selected: boolean; onToggle: () => void; onUpdateStatus: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasProdutos = dev.produtos && dev.produtos.length > 0;
  const hasInfoAdicional = dev.infAdicionais && dev.infAdicionais.trim();
  const hasEmitente = dev.emitente && dev.emitente.razaoSocial;
  const isPendente = dev.status === "PENDENTE";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors" onClick={() => setExpanded(!expanded)}>
        {/* Checkbox */}
        {isPendente && (
          <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="flex-shrink-0">
            {selected ? <CheckSquare size={18} className="text-orange-500" /> : <Square size={18} className="text-slate-400" />}
          </button>
        )}
        {!isPendente && <div className="w-[18px]" />}

        <div className="hidden sm:flex w-9 h-9 rounded-xl items-center justify-center flex-shrink-0" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.15)" }}>
          <FileText size={16} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-bold" style={{ color: "#3b82f6" }}>NF {dev.numero}</span>
            {dev.serie && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--surface2)", color: "var(--text3)" }}>S{dev.serie}</span>}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
              background: dev.status === "PENDENTE" ? "rgba(249,115,22,.1)" : dev.status === "DESCARTADO" ? "rgba(107,114,128,.1)" : "rgba(16,185,129,.1)",
              color: dev.status === "PENDENTE" ? "#f97316" : dev.status === "DESCARTADO" ? "#6b7280" : "#10b981",
            }}>{STATUS_DEV_LABELS[dev.status]}</span>
          </div>
          <div className="text-xs truncate" style={{ color: "var(--text2)" }}>{dev.emitenteRazao}</div>
          <div className="md:hidden text-[10px] font-mono mt-1" style={{ color: "var(--text3)" }}>
            <span className="text-emerald-600 font-bold">{formatCurrency(dev.valorNota)}</span>
            <span className="mx-1">·</span>{dev.volumes || 0} vol
            <span className="mx-1">·</span>{dev.produtos?.length || 0} itens
          </div>
        </div>

        <div className="hidden md:flex items-center gap-6 flex-shrink-0">
          <div className="text-center"><div className="text-[9px] font-mono uppercase text-slate-400">Volumes</div><div className="text-sm font-bold font-mono">{dev.volumes || 0}</div></div>
          <div className="text-center"><div className="text-[9px] font-mono uppercase text-slate-400">Peso</div><div className="text-sm font-bold font-mono">{formatWeight(dev.pesoBruto)}</div></div>
          <div className="text-center"><div className="text-[9px] font-mono uppercase text-slate-400">Valor NF</div><div className="text-sm font-bold font-mono" style={{ color: "#10b981" }}>{formatCurrency(dev.valorNota)}</div></div>
          <div className="text-center"><div className="text-[9px] font-mono uppercase text-slate-400">Itens</div><div className="text-sm font-bold font-mono">{dev.produtos?.length || 0}</div></div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isPendente && (
            <button onClick={(e) => { e.stopPropagation(); onUpdateStatus(); }}
              className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "var(--surface2)", color: "var(--text2)" }}>
              Status
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Excluir NF da ocorrência"
            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors">
            <Trash2 size={14} />
          </button>
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            {/* Left: Fornecedor + NF data */}
            <div className="space-y-4">
              {hasEmitente && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <User size={13} className="text-slate-400" />
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400">Fornecedor / Emitente</span>
                  </div>
                  <div className="space-y-2">
                    <Field label="Razão Social" value={dev.emitente.razaoSocial} />
                    {dev.emitente.fantasia && dev.emitente.fantasia !== "undefined" && <Field label="Nome Fantasia" value={dev.emitente.fantasia} />}
                    <Field label="CNPJ" value={formatCNPJ(dev.emitente.cnpj)} mono />
                    {dev.emitente.ie && dev.emitente.ie !== "undefined" && <Field label="Inscrição Estadual" value={dev.emitente.ie} mono />}
                    <Field label="Cidade / UF" value={`${dev.emitente.cidade}${dev.emitente.uf ? ` — ${dev.emitente.uf}` : ""}`} />
                    {dev.emitente.endereco && dev.emitente.endereco.trim() && <Field label="Endereço" value={`${dev.emitente.endereco}${dev.emitente.bairro ? `, ${dev.emitente.bairro}` : ""}`} />}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={13} className="text-slate-400" />
                  <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400">Dados da Nota Fiscal</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Número" value={dev.numero} mono />
                  <Field label="Série" value={dev.serie} mono />
                  <Field label="Data Emissão" value={formatDate(dev.dataEmissao)} mono />
                  <div className="col-span-2"><Field label="Chave de Acesso" value={dev.chaveAcesso} mono color="#3b82f6" /></div>
                  <Field label="Volumes" value={String(dev.volumes || 0)} mono />
                  <Field label="Peso Bruto" value={formatWeight(dev.pesoBruto)} mono />
                  <Field label="Valor Total NF" value={formatCurrency(dev.valorNota)} color="#10b981" />
                </div>
              </div>

              {dev.responsavel && (
                <div className="p-3 rounded-lg" style={{ background: "rgba(16,185,129,.05)", border: "1px solid rgba(16,185,129,.15)" }}>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-emerald-500 mb-1">Dados da Retirada</div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>{dev.responsavel}</p>
                  {dev.observacoes && <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text2)" }}>{dev.observacoes}</p>}
                </div>
              )}
            </div>

            {/* Right: Products */}
            <div>
              {hasProdutos && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Box size={13} className="text-slate-400" />
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400">Produtos / Serviços ({dev.produtos.length})</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "var(--surface2)" }}>
                          <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase text-slate-400">#</th>
                          <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase text-slate-400">Descrição</th>
                          <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase text-slate-400">NCM</th>
                          <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase text-slate-400">Qtd</th>
                          <th className="text-center px-2 py-1.5 text-[9px] font-bold uppercase text-slate-400">Un</th>
                          <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase text-slate-400">Valor Un.</th>
                          <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase text-slate-400">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dev.produtos.map((p: any, i: number) => (
                          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                            <td className="px-2 py-1.5 font-mono text-slate-400">{i + 1}</td>
                            <td className="px-2 py-1.5">
                              <div className="font-medium">{p.descricao}</div>
                              <div className="text-[9px] font-mono text-slate-400">Cód: {p.codigoProduto}</div>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-slate-500">{p.ncm}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{p.quantidade}</td>
                            <td className="px-2 py-1.5 text-center">{p.unidade}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-slate-500">{formatCurrency(p.valorUnitario)}</td>
                            <td className="px-2 py-1.5 text-right font-mono font-bold" style={{ color: "#10b981" }}>{formatCurrency(p.valorTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                          <td colSpan={6} className="px-2 py-2 text-right text-[10px] font-bold uppercase text-slate-500">Total Produtos</td>
                          <td className="px-2 py-2 text-right font-mono font-bold" style={{ color: "#10b981" }}>
                            {formatCurrency(dev.produtos.reduce((s: number, p: any) => s + (p.valorTotal || 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dados Adicionais */}
          {hasInfoAdicional && (
            <div className="mt-4 p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Info size={13} className="text-slate-400" />
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-slate-400">Dados Adicionais</span>
              </div>
              <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text2)" }}>{dev.infAdicionais}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
