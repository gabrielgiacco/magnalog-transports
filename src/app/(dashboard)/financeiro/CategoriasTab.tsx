"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, Button, Loading, Empty, Table, Th, Td, Tr, Modal, Input, Select } from "@/components/ui";
import toast from "react-hot-toast";

export function CategoriasTab() {
  const [categorias, setCategorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [form, setForm] = useState<any>({ tipo: "DESPESA" });
  const [subForm, setSubForm] = useState<any>({ nome: "", categoriaId: "" });

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
  async function handleSaveSub() {
    try {
      const res = await fetch("/api/financeiro/subcategorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subForm)
      });
      if (!res.ok) throw new Error();
      toast.success("Subcategoria criada");
      setShowSubModal(false);
      fetchData();
    } catch {
      toast.error("Erro ao salvar");
    }
  }
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text2)" }}>Categorias Financeiras</h2>
        <Button onClick={() => { setForm({ tipo: "DESPESA" }); setShowModal(true); }}>
          + Nova Categoria
        </Button>
      </div>

      <Card className="p-0 overflow-hidden shadow-none">
        {loading ? <Loading /> : categorias.length === 0 ? <Empty text="Nenhuma categoria encontrada" /> : (
          <Table>
            <thead style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Subcategorias</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {categorias.map(c => (
                <Tr key={c.id}>
                  <Td className="font-bold text-sm" style={{ color: "var(--text)" }}>{c.nome}</Td>
                  <Td>
                    {c.tipo === "RECEITA" ? <span className="text-emerald-500 font-bold text-xs">RECEITA</span> : <span className="text-rose-500 font-bold text-xs">DESPESA</span>}
                  </Td>
                  <Td className="text-xs" style={{ color: "var(--text3)" }}>
                    {c.subcategorias?.map((s: any) => s.nome).join(", ") || "Nenhuma"}
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => { setSubForm({ nome: "", categoriaId: c.id }); setShowSubModal(true); }}>
                      + Subcategoria
                    </Button>
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

      <Modal open={showSubModal} onClose={() => setShowSubModal(false)} title="Nova Subcategoria">
        <div className="space-y-4">
          <Input label="Nome da Subcategoria" value={subForm.nome || ""} onChange={e => setSubForm((f: any) => ({ ...f, nome: e.target.value }))} />
          <Button onClick={handleSaveSub} className="w-full">Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
