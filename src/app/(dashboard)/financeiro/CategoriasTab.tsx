"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, Button, Loading, Empty, Table, Th, Td, Tr, Modal, Input, Select } from "@/components/ui";
import toast from "react-hot-toast";

export function CategoriasTab() {
  const [categorias, setCategorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({ tipo: "DESPESA" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/financeiro/categorias");
    const data = await res.json();
    setCategorias(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  async function handleSave() {
    try {
      const res = await fetch("/api/financeiro/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error();
      toast.success("Categoria criada");
      setShowModal(false);
      fetchData();
    } catch {
      toast.error("Erro ao salvar");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-200">Categorias Financeiras</h2>
        <Button onClick={() => { setForm({ tipo: "DESPESA" }); setShowModal(true); }}>
          + Nova Categoria
        </Button>
      </div>

      <Card className="p-0 overflow-hidden shadow">
        {loading ? <Loading /> : categorias.length === 0 ? <Empty text="Nenhuma categoria encontrada" /> : (
          <Table>
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Subcategorias</Th>
              </tr>
            </thead>
            <tbody>
              {categorias.map(c => (
                <Tr key={c.id}>
                  <Td className="font-bold text-sm text-gray-800">{c.nome}</Td>
                  <Td>
                    {c.tipo === "RECEITA" ? <span className="text-emerald-500 font-bold">RECEITA</span> : <span className="text-rose-500 font-bold">DESPESA</span>}
                  </Td>
                  <Td className="text-xs text-gray-500">
                    {c.subcategorias?.map((s: any) => s.nome).join(", ") || "Nenhuma"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nova Categoria">
        <div className="space-y-4">
          <Input label="Nome da Categoria" value={form.nome || ""} onChange={e => set("nome", e.target.value)} />
          <Select label="Tipo" value={form.tipo} onChange={e => set("tipo", e.target.value)}>
            <option value="RECEITA">Receita</option>
            <option value="DESPESA">Despesa</option>
          </Select>
          <Button onClick={handleSave} className="w-full">Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
