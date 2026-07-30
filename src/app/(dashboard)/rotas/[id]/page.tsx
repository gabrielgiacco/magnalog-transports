"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, StatusBadge, Modal, Select, Table, Th, Td, Tr } from "@/components/ui";
import { formatWeight, formatDate, formatCurrency } from "@/lib/utils";
import {
  ArrowLeft, Truck, User, Calendar, Package, Weight,
  Plus, Trash2, CheckCircle2, PlayCircle, AlertTriangle, Search, ShieldCheck, FileText, History, Printer
} from "lucide-react";
import toast from "react-hot-toast";
import { QualityScoring } from "@/components/quality/QualityScoring";
import { QUALIDADE_ENABLED } from "@/lib/features";

const STATUS_ROTA: { key: string; label: string; icon: string; color: string; next?: string }[] = [
  { key: "PLANEJADA",    label: "Planejada",    icon: "📋", color: "#f59e0b", next: "EM_ANDAMENTO" },
  { key: "EM_ANDAMENTO", label: "Em Andamento", icon: "🚛", color: "#3b82f6", next: "CONCLUIDA" },
  { key: "CONCLUIDA",    label: "Concluída",    icon: "✅", color: "#10b981" },
  { key: "CANCELADA",    label: "Cancelada",    icon: "✕",  color: "#ef4444" },
];

export default function RotaDetailPage() {
  const params = useParams()!; const id = params!.id as string;
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [rota, setRota] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddEntrega, setShowAddEntrega] = useState(false);
  const [entregasDisp, setEntregasDisp] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchEntrega, setSearchEntrega] = useState("");
  const [motoristas, setMotoristas] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [tab, setTab] = useState("info");
  const [showQualityPrompt, setShowQualityPrompt] = useState(false);

  const fetchRota = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/rotas/${id}`);
    setRota(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchRota(); }, [fetchRota]);

  useEffect(() => {
    fetch("/api/motoristas?ativo=true").then(r => r.json()).then(setMotoristas);
    fetch("/api/veiculos").then(r => r.json()).then(setVeiculos);
    fetchEntregasDisp();
  }, []);

  function fetchEntregasDisp() {
    fetch("/api/entregas?limit=500&mostrarFinalizados=false")
      .then(r => r.json())
      .then(d => setEntregasDisp((d.entregas || []).filter((e: any) => !e.rotaId)));
  }

  async function handleStatusChange(newStatus: string) {
    setSaving(true);
    try {
      await fetch(`/api/rotas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success("Status atualizado");
      fetchRota();
      if (newStatus === "CONCLUIDA" && QUALIDADE_ENABLED) {
        setShowQualityPrompt(true);
      }
    } finally { setSaving(false); }
  }

  async function handleFinalizarEntregas() {
    if (!window.confirm("Finalizar todas as entregas desta rota? Elas passarão de ENTREGUE para FINALIZADO.")) return;
    setSaving(true);
    try {
      await fetch(`/api/rotas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalizarEntregas: true }),
      });
      toast.success("Entregas finalizadas");
      fetchRota();
    } finally { setSaving(false); }
  }

  function toggleEntrega(eId: string) {
    setSelectedIds(prev => prev.includes(eId) ? prev.filter(x => x !== eId) : [...prev, eId]);
  }

  function toggleAll() {
    const filtered = filteredEntregas;
    const allSelected = filtered.every(e => selectedIds.includes(e.id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(pid => !filtered.some(e => e.id === pid)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...filtered.map(e => e.id)])));
    }
  }

  const filteredEntregas = entregasDisp.filter(e => {
    if (!searchEntrega) return true;
    const q = searchEntrega.toLowerCase();
    return (
      e.codigo?.toLowerCase().includes(q) ||
      e.razaoSocial?.toLowerCase().includes(q) ||
      e.cidade?.toLowerCase().includes(q) ||
      (e.notas && e.notas.some((n: any) => n.numero.toLowerCase().includes(q)))
    );
  });

  const allFilteredSelected = filteredEntregas.length > 0 && filteredEntregas.every(e => selectedIds.includes(e.id));

  async function handleAddEntregas() {
    if (selectedIds.length === 0) return;
    setSaving(true);
    try {
      await fetch(`/api/rotas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addEntregaIds: selectedIds }),
      });
      toast.success(`${selectedIds.length} entrega(s) adicionada(s) à rota`);
      setShowAddEntrega(false);
      setSelectedIds([]);
      setSearchEntrega("");
      fetchRota();
      fetchEntregasDisp();
    } finally { setSaving(false); }
  }

  async function handleRemoveEntrega(entregaId: string) {
    setSaving(true);
    try {
      await fetch(`/api/rotas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeEntregaId: entregaId }),
      });
      toast.success("Entrega removida da rota");
      fetchRota();
      fetchEntregasDisp();
    } finally { setSaving(false); }
  }

  async function handleUpdateField(field: string, value: string) {
    await fetch(`/api/rotas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    fetchRota();
  }

  if (loading) return <><Topbar title="Rota" /><Loading /></>;
  if (!rota || rota.error) return <><Topbar title="Rota não encontrada" /></>;

  const statusInfo = STATUS_ROTA.find(s => s.key === rota.status);
  const nextStatus = STATUS_ROTA.find(s => s.key === statusInfo?.next);

  const totalFrete = rota.entregas?.reduce((s: number, e: any) => s + (e.valorFrete || 0), 0) ?? 0;
  const nfsTotal = rota.entregas?.reduce((s: number, e: any) => s + (e.notas?.length || 0), 0) ?? 0;
  const entreguesCount = rota.entregas?.filter((e: any) => ["ENTREGUE", "FINALIZADO"].includes(e.status)).length ?? 0;
  const totalEntregas = rota.entregas?.length ?? 0;
  const progresso = totalEntregas > 0 ? Math.round((entreguesCount / totalEntregas) * 100) : 0;

  const selPeso = filteredEntregas.filter(e => selectedIds.includes(e.id)).reduce((s, e) => s + (e.pesoTotal || 0), 0);
  const selVol = filteredEntregas.filter(e => selectedIds.includes(e.id)).reduce((s, e) => s + (e.volumeTotal || 0), 0);

  return (
    <>
      <Topbar
        title={rota.codigo}
        subtitle={`Rota · ${formatDate(rota.data)}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/rotas")}>
              <ArrowLeft size={14} /> Voltar
            </Button>
            {rota.status !== "CANCELADA" && rota.status !== "CONCLUIDA" && (
              <Button variant="danger" size="sm" onClick={() => handleStatusChange("CANCELADA")}>
                Cancelar Rota
              </Button>
            )}
            {nextStatus && (
              <Button size="sm" onClick={() => handleStatusChange(nextStatus.key)} loading={saving}>
                {nextStatus.icon} {nextStatus.label}
              </Button>
            )}
            {rota.status === "CONCLUIDA" && rota.entregas?.some((e: any) => e.status !== "FINALIZADO" && e.status !== "OCORRENCIA") && (
              <Button size="sm" onClick={handleFinalizarEntregas} loading={saving}>
                🏁 Finalizar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => window.open(`/imprimir/carta-frete/rota/${id}`, '_blank')}>
              <Printer size={14} /> Carta Frete
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Progress Card */}
        <Card>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="text-3xl">{statusInfo?.icon}</div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-0.5" style={{ color: "var(--text3)" }}>Status</div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={rota.status} />
                  {QUALIDADE_ENABLED && rota.qualidade?.id && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"
                      style={{ background: "rgba(234, 179, 8, 0.15)", color: "#ca8a04", border: "1px solid rgba(234, 179, 8, 0.3)" }}
                      title="Rota possui registro de Qualidade">
                      ⭐ Avaliada
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="h-10 w-px" style={{ background: "var(--border)" }} />
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs" style={{ color: "var(--text3)" }}>Progresso Operacional</span>
                <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>{entreguesCount}/{totalEntregas} concluídas</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progresso}%`, background: "var(--accent)" }} />
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2 border-b" style={{ borderColor: "var(--border)" }}>
          <TabButton active={tab === "info"} onClick={() => setTab("info")} icon={FileText}>Visão Geral</TabButton>
          {isAdmin && QUALIDADE_ENABLED && (
            <TabButton active={tab === "qualidade"} onClick={() => setTab("qualidade")} icon={ShieldCheck}>Qualidade Operacional</TabButton>
          )}
        </div>

        {tab === "info" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-4" style={{ color: "var(--text3)" }}>Detalhes da Rota</div>
                <div className="space-y-4">
                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold" style={{ color: "var(--text3)" }}>Motorista Responsável</span>
                      <select value={rota.motoristaId || ""} onChange={e => handleUpdateField("motoristaId", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent"
                        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                        <option value="">— Selecionar —</option>
                        {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                      </select>
                   </div>
                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold" style={{ color: "var(--text3)" }}>Veículo Utilizado</span>
                      <select value={rota.veiculoId || ""} onChange={e => handleUpdateField("veiculoId", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent"
                        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                        <option value="">— Selecionar —</option>
                        {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.tipo}</option>)}
                      </select>
                   </div>
                   <div className="p-3 rounded-xl" style={{ background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)" }}>
                      <span className="text-[10px] uppercase font-bold" style={{ color: "#10b981" }}>Valor Acertado (Motorista)</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xl font-bold" style={{ color: "#10b981" }}>R$</span>
                        <input type="number" step="0.01" value={rota.valorMotorista || 0} onChange={e => handleUpdateField("valorMotorista", e.target.value)} onBlur={fetchRota}
                          className="w-full bg-transparent text-xl font-bold outline-none border-b border-dashed focus:border-emerald-500"
                          style={{ color: "#10b981", borderColor: "rgba(16,185,129,.3)" }} />
                      </div>
                   </div>
                </div>
              </Card>

              <Card className="col-span-2">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-4" style={{ color: "var(--text3)" }}>Indicadores da Rota</div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Entregas", value: new Set((rota.entregas || []).map((e: any) => e.razaoSocial)).size, color: "#f97316", icon: "📦" },
                    { label: "NFs", value: nfsTotal, color: "#3b82f6", icon: "📄" },
                    { label: "Peso", value: formatWeight(rota.pesoTotal), color: "#8b5cf6", icon: "⚖️" },
                    { label: "Receita", value: formatCurrency(totalFrete), color: "#10b981", icon: "💰" },
                  ].map(k => (
                    <div key={k.label} className="rounded-xl p-3 text-center" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                      <div className="text-xl mb-1">{k.icon}</div>
                      <div className="font-head text-xl font-black" style={{ color: k.color }}>{k.value}</div>
                      <div className="text-[9px] font-mono uppercase" style={{ color: "var(--text3)" }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="p-0 overflow-hidden">
               <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
                  <h3 className="font-bold text-sm flex items-center gap-2">
                     Lista de Entregas
                     <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface2)", color: "var(--text3)" }}>{totalEntregas}</span>
                  </h3>
                  {rota.status !== "CANCELADA" && rota.status !== "CONCLUIDA" && (
                    <Button size="sm" onClick={() => setShowAddEntrega(true)}>
                       <Plus size={14} /> Adicionar
                    </Button>
                  )}
               </div>
               {totalEntregas === 0 ? (
                 <div className="py-20 text-center" style={{ color: "var(--text3)" }}>
                    <Package size={40} className="mx-auto mb-4 opacity-20" />
                    <p className="text-sm">Nenhuma entrega vinculada a esta rota.</p>
                 </div>
               ) : (
                 <Table>
                    <thead>
                      <tr>
                        <Th>NF/Código</Th><Th>Destinatário</Th><Th>Cidade</Th><Th>Peso</Th><Th>Status</Th><Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rota.entregas.map((e: any) => (
                        <Tr key={e.id} onClick={() => router.push(`/entregas/${e.id}`)}>
                          <Td><span className="font-mono text-xs" style={{ color: "var(--accent)" }}>{e.notas?.[0]?.numero || e.codigo}</span></Td>
                          <Td><span className="font-bold text-sm">{e.razaoSocial}</span></Td>
                          <Td><span className="text-xs" style={{ color: "var(--text3)" }}>{e.cidade}/{e.uf}</span></Td>
                          <Td><span className="text-xs font-mono">{formatWeight(e.pesoTotal)}</span></Td>
                          <Td><StatusBadge status={e.status} /></Td>
                          <Td>
                             <button onClick={ev => { ev.stopPropagation(); handleRemoveEntrega(e.id); }} className="p-2 text-red-400 hover:text-red-600">
                                <Trash2 size={14} />
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

        {tab === "qualidade" && isAdmin && QUALIDADE_ENABLED && (
          <Card>
            <div className="flex items-center gap-2 mb-6">
              <ShieldCheck className="text-accent" />
              <h2 className="text-lg font-bold">Qualidade da Rota (Fracionado)</h2>
            </div>
            <QualityScoring rotaId={id} />
          </Card>
        )}
      </div>

      {/* Quality Prompt Modal */}
      <Modal open={showQualityPrompt} onClose={() => setShowQualityPrompt(false)} title="Avaliação de Qualidade Operacional" size="lg">
        <div className="mb-4 p-3 rounded-xl flex items-center gap-3" style={{ background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.2)" }}>
          <ShieldCheck size={20} className="text-orange-500 flex-shrink-0" />
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            Rota concluída! Registre a avaliação de qualidade operacional antes de continuar.
          </p>
        </div>
        <QualityScoring rotaId={id} onSave={() => { setShowQualityPrompt(false); toast.success("Avaliação salva!"); }} />
      </Modal>

      {/* Modal Add Entregas remains largely the same but simplified UI */}
      <Modal open={showAddEntrega} onClose={() => setShowAddEntrega(false)} title="Adicionar Entregas" size="xl">
          <div className="flex flex-col gap-4">
             <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <Search size={16} className="ml-2" style={{ color: "var(--text3)" }} />
                <input type="text" placeholder="Filtrar por nome, NF ou cidade..." value={searchEntrega} onChange={e => setSearchEntrega(e.target.value)}
                  className="bg-transparent flex-1 outline-none text-sm" style={{ color: "var(--text)" }} />
             </div>
             <div className="max-h-[400px] overflow-y-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
                {filteredEntregas.map(e => {
                  const sel = selectedIds.includes(e.id);
                  return (
                    <div key={e.id} onClick={() => toggleEntrega(e.id)}
                      className="flex items-center gap-4 p-4 cursor-pointer transition-all hover:opacity-90"
                      style={{ borderBottom: "1px solid var(--border)", background: sel ? "rgba(249,115,22,.06)" : "transparent" }}>
                       <div className="w-5 h-5 rounded-md border flex items-center justify-center"
                         style={{ background: sel ? "var(--accent)" : "transparent", borderColor: sel ? "var(--accent)" : "var(--border)" }}>
                          {sel && <CheckCircle2 size={12} className="text-white" />}
                       </div>
                       <div className="flex-1">
                          <div className="text-[10px] font-mono" style={{ color: "var(--accent)" }}>NF {e.notas?.[0]?.numero || e.codigo}</div>
                          <div className="text-sm font-bold">{e.razaoSocial}</div>
                       </div>
                       <div className="text-right">
                          <div className="text-xs" style={{ color: "var(--text3)" }}>{e.cidade}</div>
                          <div className="text-[10px] font-mono uppercase" style={{ color: "var(--text3)" }}>{formatWeight(e.pesoTotal)}</div>
                       </div>
                    </div>
                  );
                })}
             </div>
             <div className="flex justify-between items-center -mx-6 -mb-6 p-6 border-t" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                <span className="text-xs font-bold" style={{ color: "var(--text3)" }}>{selectedIds.length} selecionadas</span>
                <div className="flex gap-2">
                   <Button variant="ghost" onClick={() => setShowAddEntrega(false)}>Cancelar</Button>
                   <Button onClick={handleAddEntregas} loading={saving} disabled={selectedIds.length === 0}>Vincular Entregas</Button>
                </div>
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
      className="flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2"
      style={{
        borderColor: active ? "var(--accent)" : "transparent",
        color: active ? "var(--accent)" : "var(--text3)",
      }}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}
