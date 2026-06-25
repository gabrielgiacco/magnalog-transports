"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Input, Select, Loading, Empty, Modal, Textarea } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Pencil, Trash2, CheckCircle2, AlertTriangle, Calendar, Clock } from "lucide-react";

interface Conta {
  id: string;
  tipo: "MOTORISTA" | "DESCARGA" | "ABASTECIMENTO" | "PEDAGIO" | "OUTROS";
  descricao: string;
  valor: number;
  dataVencimento: string;
  dataPagamento: string | null;
  status: "PENDENTE" | "PAGO" | "CANCELADO";
  favorecido: string | null;
  formaPagamento: string | null;
  observacoes: string | null;
  rota?: { id: string; codigo: string };
  entrega?: { id: string; codigo: string };
}

const TIPOS = [
  { value: "MOTORISTA", label: "Motorista" },
  { value: "DESCARGA", label: "Descarga / Chapa" },
  { value: "ABASTECIMENTO", label: "Combustível" },
  { value: "PEDAGIO", label: "Pedágio" },
  { value: "OUTROS", label: "Outros" },
];

const FORMAS_PAGAMENTO = [
  { value: "", label: "—" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "PIX", label: "PIX" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CARTAO_CREDITO", label: "Cartão Crédito" },
  { value: "CARTAO_DEBITO", label: "Cartão Débito" },
  { value: "CHEQUE", label: "Cheque" },
];

export function ContasPagarTab() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPendente, setTotalPendente] = useState(0);
  const [totalPago, setTotalPago] = useState(0);

  const [filtroStatus, setFiltroStatus] = useState("PENDENTE");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroBusca, setFiltroBusca] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [pagarModal, setPagarModal] = useState<Conta | null>(null);
  const [editing, setEditing] = useState<Conta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtroStatus) params.set("status", filtroStatus);
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroBusca) params.set("q", filtroBusca);
    const res = await fetch(`/api/financeiro/contas-pagar?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setContas(data.contas);
      setTotalPendente(data.totalPendente);
      setTotalPago(data.totalPago);
    }
    setLoading(false);
  }, [filtroStatus, filtroTipo, filtroBusca]);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(c: Conta) { setEditing(c); setModalOpen(true); }

  async function handleDelete(c: Conta) {
    if (!confirm(`Apagar "${c.descricao}"?`)) return;
    const res = await fetch(`/api/financeiro/contas-pagar/${c.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Apagada"); load(); }
    else toast.error("Erro ao apagar");
  }

  // agrupar por urgência
  const grupos = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const em7d = new Date(hoje); em7d.setDate(em7d.getDate() + 7);
    const em30d = new Date(hoje); em30d.setDate(em30d.getDate() + 30);

    const vencidas: Conta[] = [];
    const hojeArr: Conta[] = [];
    const sete: Conta[] = [];
    const trinta: Conta[] = [];
    const futuras: Conta[] = [];

    for (const c of contas) {
      if (c.status !== "PENDENTE") continue;
      const v = new Date(c.dataVencimento); v.setHours(0, 0, 0, 0);
      if (v < hoje) vencidas.push(c);
      else if (v.getTime() === hoje.getTime()) hojeArr.push(c);
      else if (v <= em7d) sete.push(c);
      else if (v <= em30d) trinta.push(c);
      else futuras.push(c);
    }

    return { vencidas, hojeArr, sete, trinta, futuras };
  }, [contas]);

  const totalVencido = grupos.vencidas.reduce((s, c) => s + c.valor, 0);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(239,68,68,.1)" }}>
            <AlertTriangle size={18} style={{ color: "#dc2626" }} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Vencidas</div>
            <div className="text-lg font-head font-bold font-mono" style={{ color: "#dc2626" }}>{formatCurrency(totalVencido)}</div>
            <div className="text-[10px]" style={{ color: "var(--text3)" }}>{grupos.vencidas.length} contas</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,.1)" }}>
            <Clock size={18} style={{ color: "#d97706" }} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Total Pendente</div>
            <div className="text-lg font-head font-bold font-mono" style={{ color: "#d97706" }}>{formatCurrency(totalPendente)}</div>
            <div className="text-[10px]" style={{ color: "var(--text3)" }}>todas as datas</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(5,150,105,.1)" }}>
            <CheckCircle2 size={18} style={{ color: "#059669" }} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Pago no período</div>
            <div className="text-lg font-head font-bold font-mono" style={{ color: "#059669" }}>{formatCurrency(totalPago)}</div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-36">
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Status</label>
            <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="PAGO">Pagas</option>
              <option value="CANCELADO">Canceladas</option>
            </Select>
          </div>
          <div className="w-44">
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Tipo</label>
            <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Buscar</label>
            <Input placeholder="Descrição ou favorecido" value={filtroBusca} onChange={(e) => setFiltroBusca(e.target.value)} />
          </div>
          <Button size="sm" onClick={openNew}><Plus size={14} /> Nova Conta a Pagar</Button>
        </div>
      </Card>

      {loading ? <Loading /> : contas.length === 0 ? (
        <Empty icon="💸" text="Nenhuma conta a pagar com esses filtros" />
      ) : filtroStatus === "PENDENTE" ? (
        <div className="space-y-3">
          <GrupoContas titulo="🔴 Vencidas" color="#dc2626" contas={grupos.vencidas} onEdit={openEdit} onDelete={handleDelete} onPagar={(c) => setPagarModal(c)} />
          <GrupoContas titulo="⚠️ Vencem Hoje" color="#d97706" contas={grupos.hojeArr} onEdit={openEdit} onDelete={handleDelete} onPagar={(c) => setPagarModal(c)} />
          <GrupoContas titulo="📅 Próximos 7 dias" color="#ea580c" contas={grupos.sete} onEdit={openEdit} onDelete={handleDelete} onPagar={(c) => setPagarModal(c)} />
          <GrupoContas titulo="🗓️ Próximos 30 dias" color="#2563eb" contas={grupos.trinta} onEdit={openEdit} onDelete={handleDelete} onPagar={(c) => setPagarModal(c)} />
          <GrupoContas titulo="🕒 Futuras" color="var(--text3)" contas={grupos.futuras} onEdit={openEdit} onDelete={handleDelete} onPagar={(c) => setPagarModal(c)} />
        </div>
      ) : (
        <div className="space-y-2">
          {contas.map((c) => (
            <ContaRow key={c.id} conta={c} onEdit={openEdit} onDelete={handleDelete} onPagar={(c) => setPagarModal(c)} />
          ))}
        </div>
      )}

      {modalOpen && <ContaModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} onSaved={() => { setModalOpen(false); load(); }} />}
      {pagarModal && <PagarModal open={!!pagarModal} onClose={() => setPagarModal(null)} conta={pagarModal} onSaved={() => { setPagarModal(null); load(); }} />}
    </div>
  );
}

function GrupoContas({ titulo, color, contas, onEdit, onDelete, onPagar }: any) {
  if (contas.length === 0) return null;
  const total = contas.reduce((s: number, c: Conta) => s + c.valor, 0);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-2 flex justify-between items-center border-b" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
        <span className="font-bold text-sm" style={{ color }}>{titulo}</span>
        <span className="font-mono text-sm font-bold" style={{ color }}>{formatCurrency(total)} · {contas.length}</span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border)" } as any}>
        {contas.map((c: Conta) => (
          <ContaRow key={c.id} conta={c} onEdit={onEdit} onDelete={onDelete} onPagar={onPagar} />
        ))}
      </div>
    </Card>
  );
}

function ContaRow({ conta, onEdit, onDelete, onPagar }: { conta: Conta; onEdit: (c: Conta) => void; onDelete: (c: Conta) => void; onPagar: (c: Conta) => void }) {
  const tipo = TIPOS.find((t) => t.value === conta.tipo);
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
      <Calendar size={16} style={{ color: "var(--text3)" }} />
      <div className="w-20 text-xs font-mono">{formatDate(conta.dataVencimento)}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{conta.descricao}</div>
        <div className="text-[10px]" style={{ color: "var(--text3)" }}>
          {tipo?.label} {conta.favorecido && `· ${conta.favorecido}`}
          {conta.entrega && ` · Entrega ${conta.entrega.codigo}`}
          {conta.rota && ` · Rota ${conta.rota.codigo}`}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono font-bold text-sm" style={{ color: "#dc2626" }}>{formatCurrency(conta.valor)}</div>
        {conta.status === "PAGO" && conta.dataPagamento && (
          <div className="text-[10px]" style={{ color: "#059669" }}>pago em {formatDate(conta.dataPagamento)}</div>
        )}
      </div>
      <div className="flex gap-1">
        {conta.status === "PENDENTE" && (
          <Button size="sm" variant="ghost" onClick={() => onPagar(conta)} title="Marcar como paga">
            <CheckCircle2 size={14} /> Pagar
          </Button>
        )}
        <button className="p-1.5 rounded hover:bg-gray-100" onClick={() => onEdit(conta)} title="Editar"><Pencil size={13} /></button>
        <button className="p-1.5 rounded hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(conta)} title="Apagar"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

function ContaModal({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing: Conta | null; onSaved: () => void }) {
  const [tipo, setTipo] = useState(editing?.tipo || "OUTROS");
  const [descricao, setDescricao] = useState(editing?.descricao || "");
  const [valor, setValor] = useState(editing ? String(editing.valor) : "");
  const [dataVencimento, setDataVencimento] = useState(editing?.dataVencimento.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [favorecido, setFavorecido] = useState(editing?.favorecido || "");
  const [observacoes, setObservacoes] = useState(editing?.observacoes || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!descricao.trim()) return toast.error("Descrição obrigatória");
    if (!valor || Number(valor) < 0) return toast.error("Valor inválido");

    setSaving(true);
    try {
      const url = editing ? `/api/financeiro/contas-pagar/${editing.id}` : "/api/financeiro/contas-pagar";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, descricao, valor: Number(valor), dataVencimento, favorecido, observacoes }),
      });
      if (res.ok) { toast.success(editing ? "Atualizada" : "Criada"); onSaved(); }
      else { const d = await res.json(); toast.error(d.error || "Erro"); }
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Editar Conta" : "Nova Conta a Pagar"} size="md">
      <div className="space-y-3">
        <Select label="Tipo *" value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
          {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Input label="Descrição *" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Energia elétrica galpão julho" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Valor (R$) *" type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
          <Input label="Vencimento *" type="date" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} />
        </div>
        <Input label="Favorecido" value={favorecido} onChange={(e) => setFavorecido(e.target.value)} placeholder="Quem vai receber" />
        <Textarea label="Observações" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}

function PagarModal({ open, onClose, conta, onSaved }: { open: boolean; onClose: () => void; conta: Conta; onSaved: () => void }) {
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [formaPagamento, setFormaPagamento] = useState("PIX");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handlePagar() {
    setSaving(true);
    try {
      const res = await fetch(`/api/financeiro/contas-pagar/${conta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataPagamento, formaPagamento, observacoes }),
      });
      if (res.ok) { toast.success("Conta paga · Lançamento criado automaticamente"); onSaved(); }
      else toast.error("Erro");
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Marcar como Paga" size="sm">
      <div className="space-y-3">
        <div className="p-3 rounded-lg" style={{ background: "var(--surface2)" }}>
          <div className="text-xs" style={{ color: "var(--text2)" }}>Conta:</div>
          <div className="font-bold">{conta.descricao}</div>
          <div className="text-lg font-mono font-bold mt-1" style={{ color: "#dc2626" }}>{formatCurrency(conta.valor)}</div>
        </div>
        <Input label="Data do Pagamento *" type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
        <Select label="Forma de Pagamento" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
          {FORMAS_PAGAMENTO.filter((f) => f.value).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
        <Textarea label="Observações" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handlePagar} loading={saving}><CheckCircle2 size={14} /> Confirmar Pagamento</Button>
        </div>
      </div>
    </Modal>
  );
}
