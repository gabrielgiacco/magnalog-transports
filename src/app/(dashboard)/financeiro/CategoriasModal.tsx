"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Modal, Input, Select, Loading } from "@/components/ui";
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, Eye, EyeOff } from "lucide-react";

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

export function CategoriasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInativas, setShowInativas] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<"RECEITA" | "DESPESA">("DESPESA");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNome, setEditingNome] = useState("");
  const [adicionarSubFor, setAdicionarSubFor] = useState<string | null>(null);
  const [novaSubNome, setNovaSubNome] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const url = showInativas ? "/api/financeiro/categorias?ativo=false" : "/api/financeiro/categorias";
    const res = await fetch(url);
    if (res.ok) setCategorias(await res.json());
    setLoading(false);
  }, [showInativas]);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function handleCreate() {
    if (!novoNome.trim()) return;
    const res = await fetch("/api/financeiro/categorias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novoNome.trim(), tipo: novoTipo }),
    });
    if (res.ok) {
      toast.success("Categoria criada");
      setNovoNome("");
      load();
    } else {
      const data = await res.json();
      toast.error(data.error || "Erro ao criar");
    }
  }

  async function handleRename(id: string) {
    if (!editingNome.trim()) { setEditingId(null); return; }
    const res = await fetch(`/api/financeiro/categorias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: editingNome.trim() }),
    });
    if (res.ok) {
      toast.success("Categoria renomeada");
      setEditingId(null);
      load();
    } else {
      const data = await res.json();
      toast.error(data.error || "Erro ao renomear");
    }
  }

  async function handleToggleAtivo(c: Categoria) {
    const res = await fetch(`/api/financeiro/categorias/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !c.ativo }),
    });
    if (res.ok) {
      toast.success(c.ativo ? "Categoria desativada" : "Categoria ativada");
      load();
    }
  }

  async function handleDelete(c: Categoria) {
    if (!confirm(`Apagar categoria "${c.nome}"?`)) return;
    const res = await fetch(`/api/financeiro/categorias/${c.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Categoria apagada");
      load();
    } else {
      const data = await res.json();
      toast.error(data.error || "Erro ao apagar");
    }
  }

  async function handleAddSubcategoria(catId: string) {
    if (!novaSubNome.trim()) return;
    const res = await fetch(`/api/financeiro/categorias/${catId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novaSubNome.trim() }),
    });
    if (res.ok) {
      toast.success("Subcategoria criada");
      setNovaSubNome("");
      setAdicionarSubFor(null);
      load();
    } else {
      const data = await res.json();
      toast.error(data.error || "Erro ao criar subcategoria");
    }
  }

  const receitas = categorias.filter((c) => c.tipo === "RECEITA");
  const despesas = categorias.filter((c) => c.tipo === "DESPESA");

  return (
    <Modal open={open} onClose={onClose} title="Categorias Financeiras" size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Adicionar nova */}
        <div className="p-3 rounded-lg border space-y-2" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text2)" }}>Nova categoria</div>
          <div className="flex gap-2">
            <Select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as any)} className="w-32">
              <option value="RECEITA">Receita</option>
              <option value="DESPESA">Despesa</option>
            </Select>
            <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome da categoria" onKeyDown={(e) => e.key === "Enter" && handleCreate()} className="flex-1" />
            <Button onClick={handleCreate} size="sm"><Plus size={14} /> Adicionar</Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowInativas(!showInativas)}>
            {showInativas ? <><Eye size={13} /> Ver ativas</> : <><EyeOff size={13} /> Ver inativas</>}
          </Button>
        </div>

        {loading ? <Loading /> : (
          <div className="grid grid-cols-2 gap-4">
            <CategoriaList title="Receitas" icon={ArrowUpRight} color="#059669" cats={receitas}
              editingId={editingId} editingNome={editingNome} setEditingId={setEditingId} setEditingNome={setEditingNome}
              handleRename={handleRename} handleToggleAtivo={handleToggleAtivo} handleDelete={handleDelete}
              adicionarSubFor={adicionarSubFor} setAdicionarSubFor={setAdicionarSubFor}
              novaSubNome={novaSubNome} setNovaSubNome={setNovaSubNome} handleAddSubcategoria={handleAddSubcategoria}
            />
            <CategoriaList title="Despesas" icon={ArrowDownRight} color="#dc2626" cats={despesas}
              editingId={editingId} editingNome={editingNome} setEditingId={setEditingId} setEditingNome={setEditingNome}
              handleRename={handleRename} handleToggleAtivo={handleToggleAtivo} handleDelete={handleDelete}
              adicionarSubFor={adicionarSubFor} setAdicionarSubFor={setAdicionarSubFor}
              novaSubNome={novaSubNome} setNovaSubNome={setNovaSubNome} handleAddSubcategoria={handleAddSubcategoria}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end pt-3 mt-3 border-t" style={{ borderColor: "var(--border)" }}>
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
      </div>
    </Modal>
  );
}

function CategoriaList({
  title, icon: Icon, color, cats,
  editingId, editingNome, setEditingId, setEditingNome,
  handleRename, handleToggleAtivo, handleDelete,
  adicionarSubFor, setAdicionarSubFor,
  novaSubNome, setNovaSubNome, handleAddSubcategoria,
}: any) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} style={{ color }} />
        <h3 className="font-bold text-sm">{title}</h3>
        <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{cats.length}</span>
      </div>
      <div className="space-y-1">
        {cats.map((c: Categoria) => (
          <div key={c.id} className="rounded-lg border p-2" style={{ borderColor: "var(--border)", background: c.ativo ? "var(--surface)" : "var(--surface2)", opacity: c.ativo ? 1 : 0.6 }}>
            <div className="flex items-center gap-1.5">
              {editingId === c.id ? (
                <>
                  <Input value={editingNome} onChange={(e: any) => setEditingNome(e.target.value)} autoFocus
                    onKeyDown={(e: any) => { if (e.key === "Enter") handleRename(c.id); if (e.key === "Escape") setEditingId(null); }}
                  />
                  <Button size="sm" onClick={() => handleRename(c.id)}>OK</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{c.nome}</span>
                  {c.sistema && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(59,130,246,.1)", color: "#2563eb" }}>SIST</span>}
                  {c._count && c._count.lancamentos > 0 && <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{c._count.lancamentos}</span>}
                  <button className="p-1 rounded hover:bg-gray-100" title="Renomear" onClick={() => { setEditingId(c.id); setEditingNome(c.nome); }}>
                    <Pencil size={11} />
                  </button>
                  <button className="p-1 rounded hover:bg-gray-100" title={c.ativo ? "Desativar" : "Ativar"} onClick={() => handleToggleAtivo(c)}>
                    {c.ativo ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                  {!c.sistema && c._count?.lancamentos === 0 && (
                    <button className="p-1 rounded hover:bg-red-50 hover:text-red-600" title="Apagar" onClick={() => handleDelete(c)}>
                      <Trash2 size={11} />
                    </button>
                  )}
                </>
              )}
            </div>
            {c.subcategorias.length > 0 && (
              <div className="ml-4 mt-1 space-y-0.5">
                {c.subcategorias.map((s: any) => (
                  <div key={s.id} className="text-xs" style={{ color: "var(--text2)" }}>· {s.nome}</div>
                ))}
              </div>
            )}
            {adicionarSubFor === c.id ? (
              <div className="ml-4 mt-1 flex gap-1">
                <Input value={novaSubNome} onChange={(e: any) => setNovaSubNome(e.target.value)} placeholder="Nome da subcategoria" autoFocus
                  onKeyDown={(e: any) => { if (e.key === "Enter") handleAddSubcategoria(c.id); if (e.key === "Escape") { setAdicionarSubFor(null); setNovaSubNome(""); } }}
                />
                <Button size="sm" onClick={() => handleAddSubcategoria(c.id)}>OK</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAdicionarSubFor(null); setNovaSubNome(""); }}>×</Button>
              </div>
            ) : (
              <button className="ml-4 mt-1 text-[10px] font-bold flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }} onClick={() => setAdicionarSubFor(c.id)}>
                <Plus size={10} /> Subcategoria
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
