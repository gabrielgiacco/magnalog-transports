"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Input, Select, Loading, Empty, Modal } from "@/components/ui";
import { formatCurrency, formatDate, formatCNPJ } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Clock, ExternalLink, ChevronDown, ChevronRight, Wallet } from "lucide-react";

interface Item {
  id: string;
  tipo: "frete" | "armazenagem";
  numero: string;
  valor: number;
  dataEmissao: string;
  dataVencimento: string;
  status: "ABERTA" | "PAGA" | "CANCELADA";
  clienteCnpj: string;
  clienteNome: string;
  aging: "vencido" | "0-30" | "31-60" | "61-90" | "90+";
  diasParaVencer: number;
}

interface ClienteAgrupado {
  cnpj: string;
  nome: string;
  total: number;
  vencido: number;
  itens: Item[];
}

const FORMAS_PAGAMENTO = [
  { value: "PIX", label: "PIX" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "BOLETO", label: "Boleto" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CHEQUE", label: "Cheque" },
];

const AGING_LABEL: Record<string, { label: string; color: string }> = {
  "vencido": { label: "VENCIDO", color: "#dc2626" },
  "0-30": { label: "0-30d", color: "#059669" },
  "31-60": { label: "31-60d", color: "#d97706" },
  "61-90": { label: "61-90d", color: "#ea580c" },
  "90+": { label: "90d+", color: "#7c2d12" },
};

export function ContasReceberTab() {
  const [agrupado, setAgrupado] = useState<ClienteAgrupado[]>([]);
  const [kpis, setKpis] = useState({ totalAberto: 0, totalVencido: 0, aVencer30d: 0 });
  const [loading, setLoading] = useState(true);
  const [filtroBusca, setFiltroBusca] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [receberModal, setReceberModal] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtroBusca) params.set("cliente", filtroBusca);
    const res = await fetch(`/api/financeiro/contas-receber?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setAgrupado(data.agrupado);
      setKpis(data.kpis);
    }
    setLoading(false);
  }, [filtroBusca]);

  useEffect(() => { load(); }, [load]);

  function toggle(cnpj: string) {
    const next = new Set(expanded);
    if (next.has(cnpj)) next.delete(cnpj); else next.add(cnpj);
    setExpanded(next);
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(5,150,105,.1)" }}>
            <Wallet size={18} style={{ color: "#059669" }} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Total em aberto</div>
            <div className="text-lg font-head font-bold font-mono" style={{ color: "#059669" }}>{formatCurrency(kpis.totalAberto)}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(239,68,68,.1)" }}>
            <AlertTriangle size={18} style={{ color: "#dc2626" }} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Vencido</div>
            <div className="text-lg font-head font-bold font-mono" style={{ color: "#dc2626" }}>{formatCurrency(kpis.totalVencido)}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,.1)" }}>
            <Clock size={18} style={{ color: "#d97706" }} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>A vencer em 30d</div>
            <div className="text-lg font-head font-bold font-mono" style={{ color: "#d97706" }}>{formatCurrency(kpis.aVencer30d)}</div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Buscar cliente</label>
            <Input placeholder="Nome ou CNPJ" value={filtroBusca} onChange={(e) => setFiltroBusca(e.target.value)} />
          </div>
          <Button variant="ghost" size="sm" onClick={() => window.location.href = "/faturamento"}>
            <ExternalLink size={14} /> Gerar Faturas
          </Button>
        </div>
      </Card>

      {loading ? <Loading /> : agrupado.length === 0 ? (
        <Empty icon="📥" text="Nenhuma fatura em aberto" />
      ) : (
        <div className="space-y-2">
          {agrupado.map((c) => {
            const isOpen = expanded.has(c.cnpj);
            return (
              <Card key={c.cnpj} className="p-0 overflow-hidden">
                <button
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50"
                  onClick={() => toggle(c.cnpj)}
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="flex-1 text-left">
                    <div className="font-bold text-sm">{c.nome}</div>
                    <div className="text-[10px]" style={{ color: "var(--text3)" }}>{formatCNPJ(c.cnpj)} · {c.itens.length} faturas</div>
                  </div>
                  {c.vencido > 0 && (
                    <div className="text-right">
                      <div className="text-[10px]" style={{ color: "var(--text3)" }}>vencido</div>
                      <div className="font-mono font-bold text-sm" style={{ color: "#dc2626" }}>{formatCurrency(c.vencido)}</div>
                    </div>
                  )}
                  <div className="text-right ml-4">
                    <div className="text-[10px]" style={{ color: "var(--text3)" }}>total</div>
                    <div className="font-mono font-bold text-base" style={{ color: "#059669" }}>{formatCurrency(c.total)}</div>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t" style={{ borderColor: "var(--border)" }}>
                    {c.itens.map((i) => {
                      const ag = AGING_LABEL[i.aging];
                      return (
                        <div key={i.id} className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0 hover:bg-gray-50" style={{ borderColor: "var(--border)" }}>
                          <span className="w-20 text-xs font-mono">{formatDate(i.dataVencimento)}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "rgba(0,0,0,.05)" }}>
                            {i.tipo === "frete" ? "Frete" : "Armaz."}
                          </span>
                          <span className="text-xs font-mono">{i.numero}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: ag.color + "20", color: ag.color }}>
                            {ag.label}
                          </span>
                          <span className="flex-1"></span>
                          <span className="font-mono font-bold text-sm" style={{ color: "#059669" }}>{formatCurrency(i.valor)}</span>
                          <Button size="sm" variant="ghost" onClick={() => setReceberModal(i)}>
                            <CheckCircle2 size={13} /> Receber
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {receberModal && (
        <ReceberModal
          open={!!receberModal}
          onClose={() => setReceberModal(null)}
          item={receberModal}
          onSaved={() => { setReceberModal(null); load(); }}
        />
      )}
    </div>
  );
}

function ReceberModal({ open, onClose, item, onSaved }: { open: boolean; onClose: () => void; item: Item; onSaved: () => void }) {
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [formaPagamento, setFormaPagamento] = useState("PIX");
  const [saving, setSaving] = useState(false);

  async function handleReceber() {
    setSaving(true);
    try {
      const res = await fetch("/api/financeiro/contas-receber", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, tipo: item.tipo, dataPagamento, formaPagamento }),
      });
      if (res.ok) {
        toast.success("Recebimento registrado · Lançamento criado automaticamente");
        onSaved();
      } else {
        toast.error("Erro ao registrar recebimento");
      }
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar Recebimento" size="sm">
      <div className="space-y-3">
        <div className="p-3 rounded-lg" style={{ background: "var(--surface2)" }}>
          <div className="text-xs" style={{ color: "var(--text2)" }}>Fatura {item.numero}</div>
          <div className="font-bold">{item.clienteNome}</div>
          <div className="text-lg font-mono font-bold mt-1" style={{ color: "#059669" }}>{formatCurrency(item.valor)}</div>
        </div>
        <Input label="Data do Recebimento *" type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
        <Select label="Forma de Recebimento" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
          {FORMAS_PAGAMENTO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleReceber} loading={saving}><CheckCircle2 size={14} /> Confirmar</Button>
        </div>
      </div>
    </Modal>
  );
}
