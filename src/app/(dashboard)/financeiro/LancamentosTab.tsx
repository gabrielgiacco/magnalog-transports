"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, Button, StatusBadge, Loading, Empty, Table, Th, Td, Tr, Modal, Input, Select } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

export function LancamentosTab() {
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({ tipo: "DESPESA", status: "PENDENTE" });

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

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-200">Lançamentos de Caixa</h2>
        <Button onClick={() => { setForm({ tipo: "DESPESA", status: "PENDENTE" }); setShowModal(true); }}>
          + Novo Lançamento
        </Button>
      </div>

      <Card className="p-0 overflow-hidden shadow">
        {loading ? <Loading /> : lancamentos.length === 0 ? <Empty text="Nenhum lançamento encontrado" /> : (
          <Table>
            <thead className="bg-gray-50 border-b border-gray-100">
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
                    <div className="font-bold text-sm text-gray-800">{l.descricao}</div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      {l.tipo === "RECEITA" ? <span className="text-emerald-500">RECEITA</span> : <span className="text-rose-500">DESPESA</span>}
                    </div>
                  </Td>
                  <Td>
                    <div className="text-sm font-medium">{l.categoria?.nome || "-"}</div>
                    <div className="text-[10px] text-gray-500">{l.subcategoria?.nome || ""}</div>
                  </Td>
                  <Td className="text-sm font-medium text-gray-700">{l.favorecido || "-"}</Td>
                  <Td>
                    <div className="text-xs font-bold text-gray-600">{formatDate(l.dataVencimento)}</div>
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
          <Select label="Categoria" value={form.categoriaId || ""} onChange={e => set("categoriaId", e.target.value)}>
            <option value="">Selecione...</option>
            {categorias.filter(c => c.tipo === form.tipo).map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </Select>
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
          <Button onClick={handleSave} className="w-full">Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
