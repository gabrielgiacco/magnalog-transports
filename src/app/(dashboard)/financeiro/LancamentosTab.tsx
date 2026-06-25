"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Input, Select, Loading, Empty, Modal, Table, Th, Td, Tr, Textarea } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Search, Pencil, Trash2, Filter, Settings, ArrowUpRight, ArrowDownRight, Lock } from "lucide-react";
import { CategoriasModal } from "./CategoriasModal";

interface Categoria {
  id: string;
  nome: string;
  tipo: "RECEITA" | "DESPESA";
  ativo: boolean;
  ordem: number;
  sistema: boolean;
  subcategorias: { id: string; nome: string; ativo: boolean }[];
  _count?: { lancamentos: number };
}

interface Lancamento {
  id: string;
  descricao: string;
  tipo: "RECEITA" | "DESPESA";
  valor: number;
  dataVencimento: string;
  dataPagamento: string | null;
  status: "PENDENTE" | "PAGO" | "CANCELADO";
  origem: "MANUAL" | "FATURA" | "FATURA_ARMAZENAGEM" | "ACERTO_MOTORISTA" | "CONTA_PAGAR";
  formaPagamento: string | null;
  contaBancaria: string | null;
  favorecido: string | null;
  observacoes: string | null;
  categoria: { id: string; nome: string; tipo: string } | null;
  subcategoria: { id: string; nome: string } | null;
}

const FORMAS_PAGAMENTO = [
  { value: "", label: "—" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "PIX", label: "PIX" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CARTAO_CREDITO", label: "Cartão de Crédito" },
  { value: "CARTAO_DEBITO", label: "Cartão de Débito" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OUTRO", label: "Outro" },
];

const ORIGEM_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  FATURA: "Fatura",
  FATURA_ARMAZENAGEM: "Fatura Armazenagem",
  ACERTO_MOTORISTA: "Acerto Motorista",
  CONTA_PAGAR: "Conta a Pagar",
};

export function LancamentosTab() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [totais, setTotais] = useState({ receitas: 0, despesas: 0, saldo: 0 });

  // filtros
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("");
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroInicio, setFiltroInicio] = useState("");
  const [filtroFim, setFiltroFim] = useState("");

  // modal CRUD
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Lancamento | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoriasModalOpen, setCategoriasModalOpen] = useState(false);

  const loadCategorias = useCallback(async () => {
    const res = await fetch("/api/financeiro/categorias");
    if (res.ok) setCategorias(await res.json());
  }, []);

  const loadLancamentos = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroStatus) params.set("status", filtroStatus);
    if (filtroCategoria) params.set("categoriaId", filtroCategoria);
    if (filtroBusca) params.set("q", filtroBusca);
    if (filtroInicio) params.set("inicio", filtroInicio);
    if (filtroFim) params.set("fim", filtroFim);
    params.set("limit", "100");
    const res = await fetch(`/api/financeiro/lancamentos?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setLancamentos(data.lancamentos);
      setTotais(data.totais);
    }
    setLoading(false);
  }, [filtroTipo, filtroStatus, filtroCategoria, filtroBusca, filtroInicio, filtroFim]);

  useEffect(() => {
    loadCategorias();
  }, [loadCategorias]);

  useEffect(() => {
    loadLancamentos();
  }, [loadLancamentos]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(l: Lancamento) {
    setEditing(l);
    setModalOpen(true);
  }

  async function handleDelete(l: Lancamento) {
    if (l.origem !== "MANUAL") {
      toast.error("Lançamentos automáticos não podem ser apagados.");
      return;
    }
    if (!confirm(`Apagar lançamento "${l.descricao}"?`)) return;
    const res = await fetch(`/api/financeiro/lancamentos/${l.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Lançamento apagado");
      loadLancamentos();
    } else {
      const data = await res.json();
      toast.error(data.error || "Erro ao apagar");
    }
  }

  return (
    <div className="space-y-4">
      {/* Totais */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(5,150,105,.1)" }}>
            <ArrowUpRight size={18} style={{ color: "#059669" }} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Receitas (filtradas)</div>
            <div className="text-lg font-head font-bold font-mono" style={{ color: "#059669" }}>{formatCurrency(totais.receitas)}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(239,68,68,.1)" }}>
            <ArrowDownRight size={18} style={{ color: "#dc2626" }} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Despesas (filtradas)</div>
            <div className="text-lg font-head font-bold font-mono" style={{ color: "#dc2626" }}>{formatCurrency(totais.despesas)}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: totais.saldo >= 0 ? "rgba(59,130,246,.1)" : "rgba(239,68,68,.1)" }}>
            <Filter size={18} style={{ color: totais.saldo >= 0 ? "#2563eb" : "#dc2626" }} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Saldo (filtrado)</div>
            <div className="text-lg font-head font-bold font-mono" style={{ color: totais.saldo >= 0 ? "#2563eb" : "#dc2626" }}>{formatCurrency(totais.saldo)}</div>
          </div>
        </Card>
      </div>

      {/* Filtros + ações */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
              <Input placeholder="Descrição ou favorecido" value={filtroBusca} onChange={(e) => setFiltroBusca(e.target.value)} className="pl-9" />
            </div>
          </div>
          <div className="w-32">
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Tipo</label>
            <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              <option value="RECEITA">Receitas</option>
              <option value="DESPESA">Despesas</option>
            </Select>
          </div>
          <div className="w-36">
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Status</label>
            <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="PENDENTE">Pendente</option>
              <option value="PAGO">Pago</option>
              <option value="CANCELADO">Cancelado</option>
            </Select>
          </div>
          <div className="w-48">
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Categoria</label>
            <Select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.tipo === "RECEITA" ? "↑" : "↓"} {c.nome}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>De</label>
            <Input type="date" value={filtroInicio} onChange={(e) => setFiltroInicio(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--text2)" }}>Até</label>
            <Input type="date" value={filtroFim} onChange={(e) => setFiltroFim(e.target.value)} />
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setFiltroTipo(""); setFiltroStatus(""); setFiltroCategoria(""); setFiltroBusca(""); setFiltroInicio(""); setFiltroFim(""); }}>
            Limpar
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setCategoriasModalOpen(true)}>
              <Settings size={14} /> Categorias
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus size={14} /> Novo Lançamento
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabela */}
      {loading ? (
        <Loading />
      ) : lancamentos.length === 0 ? (
        <Empty icon="💰" text="Nenhum lançamento encontrado com esses filtros" />
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <thead>
              <Tr>
                <Th>Data</Th>
                <Th>Descrição</Th>
                <Th>Categoria</Th>
                <Th>Tipo</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th>Origem</Th>
                <Th></Th>
              </Tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => {
                const eAuto = l.origem !== "MANUAL";
                return (
                  <Tr key={l.id}>
                    <Td className="font-mono text-xs">
                      {l.dataPagamento
                        ? <><span className="font-bold">{formatDate(l.dataPagamento)}</span><div className="text-[10px]" style={{ color: "var(--text3)" }}>pago</div></>
                        : <><span>{formatDate(l.dataVencimento)}</span><div className="text-[10px]" style={{ color: "var(--text3)" }}>venc.</div></>
                      }
                    </Td>
                    <Td>
                      <div className="font-medium">{l.descricao}</div>
                      {l.favorecido && <div className="text-[10px]" style={{ color: "var(--text3)" }}>{l.favorecido}</div>}
                    </Td>
                    <Td className="text-xs">
                      {l.categoria?.nome || "—"}
                      {l.subcategoria && <div className="text-[10px]" style={{ color: "var(--text3)" }}>{l.subcategoria.nome}</div>}
                    </Td>
                    <Td>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: l.tipo === "RECEITA" ? "rgba(5,150,105,.1)" : "rgba(239,68,68,.1)", color: l.tipo === "RECEITA" ? "#059669" : "#dc2626" }}>
                        {l.tipo === "RECEITA" ? "Receita" : "Despesa"}
                      </span>
                    </Td>
                    <Td className="font-mono font-bold" style={{ color: l.tipo === "RECEITA" ? "#059669" : "#dc2626" }}>
                      {l.tipo === "DESPESA" ? "-" : "+"}{formatCurrency(l.valor)}
                    </Td>
                    <Td>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{
                        background: l.status === "PAGO" ? "rgba(5,150,105,.1)" : l.status === "PENDENTE" ? "rgba(245,158,11,.1)" : "rgba(107,114,128,.1)",
                        color: l.status === "PAGO" ? "#059669" : l.status === "PENDENTE" ? "#d97706" : "#6b7280",
                      }}>
                        {l.status === "PAGO" ? "Pago" : l.status === "PENDENTE" ? "Pendente" : "Cancelado"}
                      </span>
                    </Td>
                    <Td className="text-[10px]" style={{ color: "var(--text3)" }}>
                      {eAuto && <Lock size={10} className="inline mr-1" />}
                      {ORIGEM_LABELS[l.origem]}
                    </Td>
                    <Td>
                      <div className="flex gap-1 justify-end">
                        <button className="p-1.5 rounded hover:bg-gray-100" onClick={() => openEdit(l)} title="Editar">
                          <Pencil size={13} />
                        </button>
                        {!eAuto && (
                          <button className="p-1.5 rounded hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(l)} title="Apagar">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {modalOpen && (
        <LancamentoModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          editing={editing}
          categorias={categorias}
          onSaved={() => { setModalOpen(false); loadLancamentos(); }}
        />
      )}

      {categoriasModalOpen && (
        <CategoriasModal
          open={categoriasModalOpen}
          onClose={() => { setCategoriasModalOpen(false); loadCategorias(); }}
        />
      )}
    </div>
  );
}

function LancamentoModal({
  open, onClose, editing, categorias, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: Lancamento | null;
  categorias: Categoria[];
  onSaved: () => void;
}) {
  const isAuto = editing && editing.origem !== "MANUAL";
  const [tipo, setTipo] = useState<"RECEITA" | "DESPESA">(editing?.tipo || "DESPESA");
  const [descricao, setDescricao] = useState(editing?.descricao || "");
  const [valor, setValor] = useState(editing ? String(editing.valor) : "");
  const [dataVencimento, setDataVencimento] = useState(editing?.dataVencimento.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [dataPagamento, setDataPagamento] = useState(editing?.dataPagamento?.slice(0, 10) || "");
  const [categoriaId, setCategoriaId] = useState(editing?.categoria?.id || "");
  const [subcategoriaId, setSubcategoriaId] = useState(editing?.subcategoria?.id || "");
  const [formaPagamento, setFormaPagamento] = useState(editing?.formaPagamento || "");
  const [favorecido, setFavorecido] = useState(editing?.favorecido || "");
  const [observacoes, setObservacoes] = useState(editing?.observacoes || "");
  const [saving, setSaving] = useState(false);

  const categoriasDoTipo = useMemo(() => categorias.filter((c) => c.tipo === tipo), [categorias, tipo]);
  const categoriaSelecionada = useMemo(() => categorias.find((c) => c.id === categoriaId), [categorias, categoriaId]);

  async function handleSave() {
    if (!descricao.trim()) { toast.error("Descrição obrigatória"); return; }
    if (!valor || Number(valor) < 0) { toast.error("Valor inválido"); return; }
    if (!isAuto && !categoriaId) { toast.error("Selecione uma categoria"); return; }

    setSaving(true);
    try {
      const url = editing ? `/api/financeiro/lancamentos/${editing.id}` : "/api/financeiro/lancamentos";
      const method = editing ? "PATCH" : "POST";
      const body: any = isAuto
        ? { dataPagamento: dataPagamento || null, formaPagamento: formaPagamento || null, observacoes }
        : {
            tipo, descricao, valor: Number(valor),
            dataVencimento, dataPagamento: dataPagamento || null,
            categoriaId, subcategoriaId: subcategoriaId || null,
            formaPagamento: formaPagamento || null, favorecido, observacoes,
          };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erro ao salvar");
        return;
      }
      toast.success(editing ? "Lançamento atualizado" : "Lançamento criado");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? (isAuto ? "Lançamento Automático" : "Editar Lançamento") : "Novo Lançamento"} size="md">
      <div className="space-y-3">
        {isAuto && (
          <div className="p-3 rounded-lg text-xs" style={{ background: "rgba(59,130,246,.08)", color: "#2563eb" }}>
            <Lock size={12} className="inline mr-1" />
            Este lançamento foi criado automaticamente. Apenas pagamento, forma e observações podem ser editados.
          </div>
        )}

        {!isAuto && (
          <div className="flex gap-2">
            <button
              className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
              style={tipo === "RECEITA" ? { background: "rgba(5,150,105,.1)", color: "#059669", border: "2px solid #059669" } : { background: "var(--surface2)", color: "var(--text3)", border: "2px solid var(--border)" }}
              onClick={() => { setTipo("RECEITA"); setCategoriaId(""); }}
            >
              <ArrowUpRight size={14} className="inline mr-1" /> Receita
            </button>
            <button
              className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
              style={tipo === "DESPESA" ? { background: "rgba(239,68,68,.1)", color: "#dc2626", border: "2px solid #dc2626" } : { background: "var(--surface2)", color: "var(--text3)", border: "2px solid var(--border)" }}
              onClick={() => { setTipo("DESPESA"); setCategoriaId(""); }}
            >
              <ArrowDownRight size={14} className="inline mr-1" /> Despesa
            </button>
          </div>
        )}

        <Input
          label="Descrição *"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex: Aluguel galpão julho"
          disabled={!!isAuto}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Valor (R$) *" type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} disabled={!!isAuto} />
          <Input label="Favorecido" value={favorecido} onChange={(e) => setFavorecido(e.target.value)} placeholder="Quem recebe / paga" disabled={!!isAuto} />
        </div>

        {!isAuto && (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Categoria *" value={categoriaId} onChange={(e) => { setCategoriaId(e.target.value); setSubcategoriaId(""); }}>
              <option value="">Selecione</option>
              {categoriasDoTipo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
            <Select label="Subcategoria" value={subcategoriaId} onChange={(e) => setSubcategoriaId(e.target.value)} disabled={!categoriaSelecionada || !categoriaSelecionada.subcategorias.length}>
              <option value="">—</option>
              {categoriaSelecionada?.subcategorias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Vencimento *" type="date" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} disabled={!!isAuto} />
          <Input label="Data de Pagamento" type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
        </div>

        <Select label="Forma de Pagamento" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
          {FORMAS_PAGAMENTO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>

        <Textarea label="Observações" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}
