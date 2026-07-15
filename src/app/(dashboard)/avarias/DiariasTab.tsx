"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button, Card, Loading, Modal, Input, Textarea, Empty } from "@/components/ui";
import { formatCurrency, formatDate, formatCNPJ } from "@/lib/utils";
import { DollarSign, Search, RefreshCw, ExternalLink, Trash2, Edit2, AlertTriangle, X, CheckCircle } from "lucide-react";

interface DiariaItem {
  id: string;
  numero: string;
  entregaId: string;
  clienteCnpj: string;
  clienteNome: string;
  motivo: string | null;
  valor: number;
  status: "PENDENTE" | "PAGA" | "CANCELADA";
  dataOcorrencia: string;
  dataPagamento: string | null;
  observacoes: string | null;
  entrega?: { id: string; codigo: string; razaoSocial: string; cidade: string | null; uf: string | null; dataAgendada: string | null } | null;
}

export function DiariasTab({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<DiariaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [soSemValor, setSoSemValor] = useState(false);

  const [editing, setEditing] = useState<DiariaItem | null>(null);
  const [editForm, setEditForm] = useState({ motivo: "", valor: "", observacoes: "" });
  const [saving, setSaving] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "100" });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (filterStatus) params.set("status", filterStatus);
      if (soSemValor) params.set("valorPendente", "true");
      const res = await fetch(`/api/diarias?${params}`);
      const data = await res.json();
      setItems(data.itens || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {
      toast.error("Erro ao carregar diárias");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filterStatus, soSemValor]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 350); return () => clearTimeout(t); }, [search]);

  function openEdit(d: DiariaItem) {
    setEditing(d);
    setEditForm({
      motivo: d.motivo || "",
      valor: d.valor > 0 ? String(d.valor).replace(".", ",") : "",
      observacoes: d.observacoes || "",
    });
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/diarias/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo: editForm.motivo || null,
          valor: editForm.valor ? parseFloat(editForm.valor.replace(",", ".")) : 0,
          observacoes: editForm.observacoes || null,
        }),
      });
      if (!res.ok) { toast.error("Erro ao salvar"); return; }
      toast.success("Diária atualizada");
      setEditing(null);
      fetchList();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(d: DiariaItem) {
    if (!confirm(`Excluir diária ${d.numero}? O lançamento financeiro (se houver) também será removido.`)) return;
    try {
      const res = await fetch(`/api/diarias/${d.id}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Erro ao excluir"); return; }
      toast.success("Diária excluída");
      fetchList();
    } catch {
      toast.error("Erro ao excluir");
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por número, cliente, motivo, código da entrega..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg text-sm border"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
            <option value="">Todos os status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="PAGA">Paga</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={soSemValor} onChange={(e) => { setSoSemValor(e.target.checked); setPage(1); }}
              className="accent-orange-500" />
            <span style={{ color: "var(--text2)" }}>Só sem valor</span>
          </label>
          <Button variant="ghost" size="sm" onClick={fetchList}><RefreshCw size={14} /> Atualizar</Button>
          <span className="text-xs ml-auto" style={{ color: "var(--text3)" }}>{total} registro(s)</span>
        </div>
      </Card>

      {/* Lista */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="py-12"><Loading /></div>
        ) : items.length === 0 ? (
          <div className="py-12"><Empty icon="💰" text="Nenhuma diária encontrada" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: "var(--surface2)" }}>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Número</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Data</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Entrega</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Cliente</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Motivo</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Valor</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Status</th>
                  <th className="text-center px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => {
                  const isPendenteValor = d.valor === 0 && d.status === "PENDENTE";
                  const isPaga = d.status === "PAGA";
                  const isCancelada = d.status === "CANCELADA";
                  return (
                    <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2 font-mono font-bold" style={{ color: "#b45309" }}>{d.numero}</td>
                      <td className="px-3 py-2 font-mono">{formatDate(d.dataOcorrencia)}</td>
                      <td className="px-3 py-2">
                        {d.entrega ? (
                          <button
                            onClick={() => router.push(`/entregas/${d.entrega!.id}`)}
                            className="flex items-center gap-1 text-[11px] font-bold hover:underline"
                            style={{ color: "var(--accent)" }}>
                            <ExternalLink size={11} /> {d.entrega.codigo}
                          </button>
                        ) : (
                          <span className="text-[11px]" style={{ color: "var(--text3)" }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[220px]">
                        <div className="truncate" title={d.clienteNome}>{d.clienteNome}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(d.clienteCnpj)}</div>
                      </td>
                      <td className="px-3 py-2 max-w-[220px]">
                        <div className="truncate text-[11px]" title={d.motivo || ""}>{d.motivo || "—"}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-right">
                        {d.valor > 0 ? (
                          <span style={{ color: "#059669", fontWeight: "bold" }}>{formatCurrency(d.valor)}</span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(217,119,6,.15)", color: "#d97706" }}>
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: isPaga ? "rgba(16,185,129,.15)" : isCancelada ? "rgba(107,114,128,.15)" : isPendenteValor ? "rgba(217,119,6,.15)" : "rgba(59,130,246,.15)",
                            color: isPaga ? "#059669" : isCancelada ? "#6b7280" : isPendenteValor ? "#d97706" : "#2563eb",
                          }}>
                          {isPaga ? "PAGA" : isCancelada ? "CANCELADA" : isPendenteValor ? "VALOR PENDENTE" : "PENDENTE"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(d)}
                            className="p-1.5 rounded hover:bg-slate-100"
                            title="Editar"
                          >
                            <Edit2 size={13} className="text-slate-500" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(d)}
                              className="p-1.5 rounded hover:bg-red-50"
                              title="Excluir (ADMIN)"
                            >
                              <Trash2 size={13} className="text-red-500" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between p-3 border-t" style={{ borderColor: "var(--border)" }}>
            <span className="text-[11px]" style={{ color: "var(--text3)" }}>Página {page} de {pages}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="ghost" size="sm" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal editar */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar Diária ${editing?.numero || ""}`} size="sm">
        {editing && (
          <div className="space-y-4">
            <div className="text-xs p-3 rounded-lg" style={{ background: "var(--surface2)", color: "var(--text2)" }}>
              Entrega <strong>{editing.entrega?.codigo}</strong> — {editing.clienteNome}
            </div>
            <Input
              label="Motivo"
              value={editForm.motivo}
              onChange={(e) => setEditForm((f) => ({ ...f, motivo: e.target.value }))}
              placeholder="ex: atraso 1 dia"
            />
            <Input
              label="Valor (R$)"
              type="text"
              value={editForm.valor}
              onChange={(e) => setEditForm((f) => ({ ...f, valor: e.target.value }))}
              placeholder="0,00"
            />
            <Textarea
              label="Observações"
              value={editForm.observacoes}
              onChange={(e) => setEditForm((f) => ({ ...f, observacoes: e.target.value }))}
              rows={3}
            />
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button onClick={handleSaveEdit} loading={saving}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
