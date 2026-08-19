"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Loading, Modal, Empty, Table, Th, Td, Tr } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AnexosCard } from "@/components/entrega/AnexosCard";
import { LogOut, Plus, Printer, Search, Paperclip, ChevronLeft, X } from "lucide-react";

type Origem = "AVARIA" | "DEVOLUCAO" | "OCORRENCIA";

interface Selecionavel {
  id: string;
  referencia: string;
  descricao: string;
  detalhe?: string;
  valor: number;
}

const SECOES: { origem: Origem; titulo: string; vazio: string }[] = [
  { origem: "AVARIA", titulo: "Avarias / Registros", vazio: "Nenhuma avaria em aberto." },
  { origem: "DEVOLUCAO", titulo: "Notas de Devolução", vazio: "Nenhuma nota de devolução pendente." },
  { origem: "OCORRENCIA", titulo: "Ocorrências", vazio: "Nenhuma ocorrência em aberto." },
];

export function DeclaracaoSaidaTab() {
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [salvando, setSalvando] = useState(false);

  const [fontes, setFontes] = useState<Record<Origem, Selecionavel[]>>({ AVARIA: [], DEVOLUCAO: [], OCORRENCIA: [] });
  const [carregandoFontes, setCarregandoFontes] = useState(false);
  const [selecionados, setSelecionados] = useState<{ origem: Origem; refId: string }[]>([]);
  const [filtro, setFiltro] = useState("");

  const [form, setForm] = useState({ transportadora: "", motoristaNome: "", motoristaCpf: "", placa: "", observacoes: "" });
  const [anexoDe, setAnexoDe] = useState<any | null>(null);

  const fetchLista = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/declaracoes-saida?q=${encodeURIComponent(busca)}`);
      if (res.ok) setLista((await res.json()).declaracoes || []);
    } finally { setLoading(false); }
  }, [busca]);

  useEffect(() => { fetchLista(); }, [fetchLista]);

  async function abrirModal() {
    setForm({ transportadora: "", motoristaNome: "", motoristaCpf: "", placa: "", observacoes: "" });
    setSelecionados([]);
    setFiltro("");
    setEtapa(1);
    setShowModal(true);
    setCarregandoFontes(true);
    try {
      const res = await fetch("/api/declaracoes-saida/selecionaveis");
      if (res.ok) setFontes(await res.json());
      else toast.error("Erro ao carregar itens disponíveis");
    } finally { setCarregandoFontes(false); }
  }

  const estaSelecionado = (origem: Origem, id: string) =>
    selecionados.some((s) => s.origem === origem && s.refId === id);

  function alternar(origem: Origem, id: string) {
    setSelecionados((prev) =>
      estaSelecionado(origem, id)
        ? prev.filter((s) => !(s.origem === origem && s.refId === id))
        : [...prev, { origem, refId: id }]
    );
  }

  const totalSelecionado = selecionados.reduce((soma, s) => {
    const item = fontes[s.origem]?.find((i) => i.id === s.refId);
    return soma + (item?.valor || 0);
  }, 0);

  async function salvarEImprimir() {
    if (!form.transportadora.trim() || !form.motoristaNome.trim() || !form.placa.trim()) {
      toast.error("Transportadora, motorista e placa são obrigatórios");
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/declaracoes-saida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, itens: selecionados }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao salvar");
      const criada = await res.json();
      toast.success(`Declaração ${criada.codigo} emitida!`);
      window.open(`/imprimir/declaracao-saida/${criada.id}`, "_blank");
      setShowModal(false);
      fetchLista();
    } catch (e: any) {
      toast.error(e.message || "Erro ao emitir declaração");
    } finally { setSalvando(false); }
  }

  const filtrar = (itens: Selecionavel[]) => {
    const q = filtro.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) =>
      i.referencia.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q) || (i.detalhe || "").toLowerCase().includes(q)
    );
  };

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-start gap-3">
            <LogOut size={20} className="text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold">Declaração de Saída</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text2)" }}>
                Documento de retirada: junta avarias, notas de devolução e ocorrências numa seleção só,
                registra quem levou e sai para o motorista assinar.
              </div>
            </div>
          </div>
          <Button onClick={abrirModal}><Plus size={14} /> Nova Declaração de Saída</Button>
        </div>
      </Card>

      <div className="relative my-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por código, motorista, placa ou transportadora..."
          className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <Loading />
        ) : lista.length === 0 ? (
          <Empty icon="📤" text="Nenhuma declaração de saída ainda. Clique em Nova para emitir a primeira." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Data</Th>
                <Th>Transportadora</Th>
                <Th>Motorista</Th>
                <Th>Placa</Th>
                <Th className="text-right">Itens</Th>
                <Th className="text-right">Valor</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <Tr key={d.id}>
                  <Td><span className="font-mono text-xs font-semibold" style={{ color: "var(--accent)" }}>{d.codigo}</span></Td>
                  <Td><span className="text-xs font-mono" style={{ color: "var(--text2)" }}>{formatDate(d.createdAt)}</span></Td>
                  <Td><span className="text-xs">{d.transportadora}</span></Td>
                  <Td><span className="text-xs">{d.motoristaNome}</span></Td>
                  <Td><span className="text-xs font-mono">{d.placa}</span></Td>
                  <Td className="text-right"><span className="text-xs font-mono">{d._count?.itens || 0}</span></Td>
                  <Td className="text-right"><span className="text-xs font-mono font-bold">{formatCurrency(d.valorTotal)}</span></Td>
                  <Td>
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => window.open(`/imprimir/declaracao-saida/${d.id}`, "_blank")}
                        className="p-1.5 rounded-lg hover:opacity-70 inline-flex items-center gap-1"
                        style={{ background: "var(--surface2)", color: "var(--text2)" }}
                        title="Reimprimir declaração"
                      >
                        <Printer size={13} /> <span className="text-xs">Imprimir</span>
                      </button>
                      <button
                        onClick={() => setAnexoDe(d)}
                        className="p-1.5 rounded-lg hover:opacity-70 inline-flex items-center gap-1"
                        style={{ background: "var(--surface2)", color: "var(--text2)" }}
                        title="Anexar via assinada"
                      >
                        <Paperclip size={13} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Anexos da via assinada */}
      <Modal open={!!anexoDe} onClose={() => setAnexoDe(null)} title={`Via assinada — ${anexoDe?.codigo || ""}`} size="lg">
        {anexoDe && (
          <AnexosCard
            apiBase={`/api/declaracoes-saida/${anexoDe.id}/anexos`}
            tiposPermitidos={["DECLARACAO", "DOCUMENTO", "FOTO", "OUTRO"]}
            tipoDefault="DECLARACAO"
            titulo="Via assinada e anexos"
          />
        )}
      </Modal>

      {/* Modal de emissão */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={`Nova Declaração de Saída — Etapa ${etapa}/2`}
        size="xl"
      >
        {etapa === 1 ? (
          <div className="space-y-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
              <input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Filtrar itens..."
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>

            {carregandoFontes ? (
              <Loading />
            ) : (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {SECOES.map(({ origem, titulo, vazio }) => {
                  const itens = filtrar(fontes[origem] || []);
                  return (
                    <div key={origem}>
                      <div className="text-[10px] font-mono uppercase tracking-widest font-bold mb-2" style={{ color: "var(--text3)" }}>
                        {titulo} ({itens.length})
                      </div>
                      {itens.length === 0 ? (
                        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--surface2)", color: "var(--text3)" }}>{vazio}</div>
                      ) : (
                        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                          {itens.map((i, idx) => {
                            const marcado = estaSelecionado(origem, i.id);
                            return (
                              <button
                                key={i.id}
                                type="button"
                                onClick={() => alternar(origem, i.id)}
                                className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
                                style={{
                                  borderTop: idx > 0 ? "1px solid var(--border)" : "none",
                                  background: marcado ? "rgba(249,115,22,.08)" : "transparent",
                                }}
                              >
                                <input type="checkbox" readOnly checked={marcado} className="accent-orange-500" />
                                <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{i.referencia}</span>
                                <span className="text-xs flex-1 truncate" style={{ color: "var(--text)" }}>{i.descricao}</span>
                                {i.detalhe && <span className="text-[10px]" style={{ color: "var(--text3)" }}>{i.detalhe}</span>}
                                {i.valor > 0 && (
                                  <span className="text-xs font-mono" style={{ color: "var(--text2)" }}>{formatCurrency(i.valor)}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-xs" style={{ color: "var(--text2)" }}>
                {selecionados.length} item(ns) · <b>{formatCurrency(totalSelecionado)}</b>
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
                <Button disabled={selecionados.length === 0} onClick={() => setEtapa(2)}>Continuar</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-xl flex items-center gap-3" style={{ background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.2)" }}>
              <LogOut size={18} className="text-orange-500 flex-shrink-0" />
              <p className="text-sm" style={{ color: "var(--text2)" }}>
                {selecionados.length} item(ns) · {formatCurrency(totalSelecionado)}. As notas de devolução
                serão marcadas como retiradas ao emitir.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Transportadora *" value={form.transportadora} onChange={(v) => setForm((f) => ({ ...f, transportadora: v }))} placeholder="Nome da transportadora..." />
              <Campo label="Motorista *" value={form.motoristaNome} onChange={(v) => setForm((f) => ({ ...f, motoristaNome: v }))} placeholder="Nome do motorista..." />
              <Campo label="CPF do Motorista" value={form.motoristaCpf} onChange={(v) => setForm((f) => ({ ...f, motoristaCpf: v }))} placeholder="000.000.000-00" mono />
              <Campo label="Placa *" value={form.placa} onChange={(v) => setForm((f) => ({ ...f, placa: v.toUpperCase() }))} placeholder="ABC-1234" mono />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: "var(--text3)" }}>Observações</label>
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                rows={3}
                placeholder="Informações adicionais que devem sair impressas..."
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>

            <div className="flex justify-between gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => setEtapa(1)}><ChevronLeft size={14} /> Voltar</Button>
              <Button onClick={salvarEImprimir} loading={salvando}>
                <Printer size={14} /> Salvar e Imprimir
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Campo({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: "var(--text3)" }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-lg text-sm outline-none ${mono ? "font-mono" : ""}`}
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
      />
    </div>
  );
}
