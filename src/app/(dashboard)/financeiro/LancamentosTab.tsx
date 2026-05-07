"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, Button, StatusBadge, Loading, Empty, Table, Th, Td, Tr, Modal, Input, Select } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { Paperclip, Upload, Plus } from "lucide-react";

export function LancamentosTab() {
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState<any>({ tipo: "DESPESA", status: "PENDENTE" });
  
  const [showCatModal, setShowCatModal] = useState(false);
  const [catNome, setCatNome] = useState("");
  const [showSubModal, setShowSubModal] = useState(false);
  const [subNome, setSubNome] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [resL, resC] = await Promise.all([
      fetch("/api/financeiro/lancamentos"),
      fetch("/api/financeiro/categorias")
    ]);
    const [dataL, dataC] = await Promise.all([resL.json(), resC.json()]);
    setLancamentos(dataL || []);
    setCategorias(dataC || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  async function handleSave() {
    try {
      const res = await fetch("/api/financeiro/lancamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error();
      toast.success("Lançamento criado");
      setShowModal(false);
      fetchData();
    } catch {
      toast.error("Erro ao salvar");
    }
  }

  async function handlePay(id: string) {
    try {
      const res = await fetch("/api/financeiro/lancamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "PAGO", dataPagamento: new Date().toISOString().slice(0,10) })
      });
      if (!res.ok) throw new Error();
      toast.success("Lançamento baixado");
      fetchData();
    } catch {
      toast.error("Erro ao baixar");
    }
  }

  async function handleSaveCat() {
    try {
      const res = await fetch("/api/financeiro/categorias", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: catNome, tipo: form.tipo })
      });
      if (!res.ok) throw new Error();
      const cat = await res.json();
      setForm((f: any) => ({ ...f, categoriaId: cat.id }));
      setShowCatModal(false);
      setCatNome("");
      fetchData();
      toast.success("Categoria adicionada");
    } catch { toast.error("Erro ao adicionar"); }
  }

  async function handleSaveSub() {
    try {
      const res = await fetch("/api/financeiro/subcategorias", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: subNome, categoriaId: form.categoriaId })
      });
      if (!res.ok) throw new Error();
      const sub = await res.json();
      setForm((f: any) => ({ ...f, subcategoriaId: sub.id }));
      setShowSubModal(false);
      setSubNome("");
      fetchData();
      toast.success("Subcategoria adicionada");
    } catch { toast.error("Erro ao adicionar"); }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/financeiro/importar", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao importar");
        return;
      }
      if (data.total === 0 && data.duplicadas > 0) {
        toast(data.message, { icon: "⚠️" });
      } else {
        toast.success(data.message);
      }
      setShowImportModal(false);
      fetchData();
    } catch {
      toast.error("Erro ao enviar arquivo");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text2)" }}>Lançamentos de Caixa</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImportModal(true)}>
            <Upload size={14} className="mr-2" /> Importar OFX
          </Button>
          <Button onClick={() => { setForm({ tipo: "DESPESA", status: "PENDENTE" }); setShowModal(true); }}>
            + Novo Lançamento
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden shadow-none">
        {loading ? <Loading /> : lancamentos.length === 0 ? <Empty text="Nenhum lançamento encontrado" /> : (
          <Table>
            <thead style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                <Th>Descrição</Th>
                <Th>Categoria</Th>
                <Th>Favorecido</Th>
                <Th>Vencimento</Th>
                <Th className="text-right">Valor</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map(l => (
                <Tr key={l.id}>
                  <Td>
                    <div className="font-bold text-sm" style={{ color: "var(--text)" }}>{l.descricao}</div>
                    <div className="text-[10px] font-mono">
                      {l.tipo === "RECEITA" ? <span className="text-emerald-500 font-bold">RECEITA</span> : <span className="text-rose-500 font-bold">DESPESA</span>}
                    </div>
                  </Td>
                  <Td>
                    <div className="text-sm font-medium">{l.categoria?.nome || "-"}</div>
                    <div className="text-[10px]" style={{ color: "var(--text3)" }}>{l.subcategoria?.nome || ""}</div>
                  </Td>
                  <Td className="text-sm font-medium" style={{ color: "var(--text2)" }}>{l.favorecido || "-"}</Td>
                  <Td>
                    <div className="text-xs font-mono">{formatDate(l.dataVencimento)}</div>
                  </Td>
                  <Td className="text-right">
                    <span className={`font-mono font-bold ${l.tipo === "RECEITA" ? "text-emerald-500" : "text-rose-500"}`}>
                      {l.tipo === "RECEITA" ? "+" : "-"}{formatCurrency(l.valor)}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge status={l.status} />
                  </Td>
                  <Td>
                    {l.status === "PENDENTE" && (
                      <Button variant="ghost" size="sm" onClick={() => handlePay(l.id)}>Baixar</Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Novo Lançamento">
        <div className="space-y-4">
          <Input label="Descrição" value={form.descricao || ""} onChange={e => set("descricao", e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Tipo" value={form.tipo} onChange={e => set("tipo", e.target.value)}>
              <option value="RECEITA">Receita</option>
              <option value="DESPESA">Despesa</option>
            </Select>
            <Input label="Valor (R$)" type="number" step="0.01" value={form.valor || ""} onChange={e => set("valor", e.target.value)} />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select label="Categoria" value={form.categoriaId || ""} onChange={e => { set("categoriaId", e.target.value); set("subcategoriaId", ""); }}>
                  <option value="">Selecione...</option>
                  {categorias.filter(c => c.tipo === form.tipo).map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </Select>
              </div>
              <Button type="button" variant="outline" className="mb-0.5 px-3" onClick={() => setShowCatModal(true)}>
                <Plus size={16} />
              </Button>
            </div>
            
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select label="Subcategoria" value={form.subcategoriaId || ""} onChange={e => set("subcategoriaId", e.target.value)} disabled={!form.categoriaId}>
                  <option value="">Selecione...</option>
                  {form.categoriaId && categorias.find(c => c.id === form.categoriaId)?.subcategorias?.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </Select>
              </div>
              <Button type="button" variant="outline" className="mb-0.5 px-3" onClick={() => setShowSubModal(true)} disabled={!form.categoriaId}>
                <Plus size={16} />
              </Button>
            </div>
          </div>

          <Input label="Favorecido (Opcional)" value={form.favorecido || ""} onChange={e => set("favorecido", e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Vencimento" type="date" value={form.dataVencimento || ""} onChange={e => set("dataVencimento", e.target.value)} />
            <Select label="Status" value={form.status} onChange={e => set("status", e.target.value)}>
              <option value="PENDENTE">Pendente</option>
              <option value="PAGO">Pago / Recebido</option>
            </Select>
          </div>
          {form.status === "PAGO" && (
            <Input label="Data de Pagamento" type="date" value={form.dataPagamento || ""} onChange={e => set("dataPagamento", e.target.value)} />
          )}

          <div className="border border-dashed border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors cursor-pointer relative mt-2">
            <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                toast.success(`Arquivo ${e.target.files[0].name} anexado (Simulação)`);
                set("anexoUrl", URL.createObjectURL(e.target.files[0]));
              }
            }} />
            <div className="flex flex-col items-center justify-center space-y-1">
              <Paperclip size={20} className="text-gray-400" />
              {form.anexoUrl ? (
                <span className="text-sm font-medium text-emerald-600">Comprovante anexado</span>
              ) : (
                <>
                  <span className="text-sm font-medium" style={{ color: "var(--text2)" }}>Adicionar anexo</span>
                  <span className="text-xs" style={{ color: "var(--text3)" }}>Comprovantes ou fotos</span>
                </>
              )}
            </div>
          </div>

          <Button onClick={handleSave} className="w-full">Salvar Lançamento</Button>
        </div>
      </Modal>

      {/* Mini Modal para Criar Categoria */}
      <Modal open={showCatModal} onClose={() => setShowCatModal(false)} title="Nova Categoria">
        <div className="space-y-4">
          <Input label="Nome da Categoria" value={catNome} onChange={e => setCatNome(e.target.value)} autoFocus />
          <Button onClick={handleSaveCat} className="w-full" disabled={!catNome.trim()}>Salvar Categoria</Button>
        </div>
      </Modal>

      {/* Mini Modal para Criar Subcategoria */}
      <Modal open={showSubModal} onClose={() => setShowSubModal(false)} title="Nova Subcategoria">
        <div className="space-y-4">
          <Input label="Nome da Subcategoria" value={subNome} onChange={e => setSubNome(e.target.value)} autoFocus />
          <Button onClick={handleSaveSub} className="w-full" disabled={!subNome.trim()}>Salvar Subcategoria</Button>
        </div>
      </Modal>

      {/* Modal de Importação */}
      <Modal open={showImportModal} onClose={() => setShowImportModal(false)} title="Importar Extrato Bancário (OFX)">
        <div className="space-y-4 text-center p-4">
          <Upload size={48} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-medium" style={{ color: "var(--text2)" }}>Selecione um arquivo OFX para importar transações do extrato bancário.</p>
          <p className="text-xs" style={{ color: "var(--text3)" }}>Baixe o arquivo OFX no internet banking do seu banco (Sicredi, Inter, Itaú, Nubank, etc). Transações duplicadas são ignoradas automaticamente.</p>
          {importing ? (
            <div className="py-6">
              <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full mx-auto mb-3"></div>
              <p className="text-sm font-medium" style={{ color: "var(--text2)" }}>Processando arquivo...</p>
            </div>
          ) : (
            <div className="relative mt-4">
              <input type="file" accept=".ofx" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleImport} />
              <Button className="w-full pointer-events-none">Selecionar Arquivo .OFX</Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
