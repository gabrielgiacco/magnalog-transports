"use client";
import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, Empty, StatusBadge, Modal, Input, Select, Table, Th, Td, Tr } from "@/components/ui";
import { Plus, Edit2, Shield, UserCheck, UserX, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "OPERACIONAL", password: "", fornecedores: "" });
  const [saving, setSaving] = useState(false);
  const [excluindo, setExcluindo] = useState<any>(null);   // usuario aguardando confirmacao
  const [bloqueio, setBloqueio] = useState<string | null>(null); // 409: historico segura a exclusao

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/usuarios");
    if (res.ok) setUsuarios(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function openNew() {
    setEditing(null);
    setForm({ name: "", email: "", role: "OPERACIONAL", password: "", fornecedores: "" });
    setShowModal(true);
  }
  function openEdit(u: any) {
    setEditing(u);
    setForm({ name: u.name || "", email: u.email || "", role: u.role, password: "", fornecedores: u.fornecedoresAutorizados?.map((f: any) => f.cnpjEmitente).join(", ") || "" });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name || !form.email) { toast.error("Nome e email são obrigatórios"); return; }
    setSaving(true);
    try {
      const cnpjs = form.fornecedores ? form.fornecedores.split(",").map((c) => c.trim().replace(/\D/g, "")).filter(Boolean) : [];
      if (editing) {
        const body: any = { id: editing.id, name: form.name, role: form.role, fornecedoresAutorizados: cnpjs };
        if (form.password) body.password = form.password;
        const res = await fetch("/api/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error();
      } else {
        const res = await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, fornecedoresAutorizados: cnpjs }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      }
      toast.success(editing ? "Usuário atualizado" : "Usuário criado!");
      setShowModal(false);
      fetch_();
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  async function toggleAprovado(u: any) {
    await fetch("/api/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, aprovado: !u.aprovado }) });
    fetch_();
    toast.success(u.aprovado ? "Acesso revogado" : "Acesso aprovado");
  }

  async function toggleAtivo(u: any) {
    const res = await fetch("/api/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, ativo: !u.ativo }) });
    fetch_();
    return res.ok;
  }

  function openExcluir(u: any) {
    setBloqueio(null);
    setExcluindo(u);
  }

  async function handleExcluir() {
    if (!excluindo) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/usuarios?id=${encodeURIComponent(excluindo.id)}`, { method: "DELETE" });
      const r = await res.json().catch(() => ({}));
      if (res.status === 409) { setBloqueio(r.error || "Usuário tem histórico. Desative em vez de excluir."); return; }
      if (!res.ok) throw new Error(r.error);
      toast.success("Usuário excluído");
      setExcluindo(null);
      fetch_();
    } catch (e: any) { toast.error(e?.message || "Erro ao excluir"); }
    finally { setSaving(false); }
  }

  async function desativarEmVez() {
    const ok = excluindo?.ativo ? await toggleAtivo(excluindo) : true;
    if (ok) toast.success("Usuário desativado"); else toast.error("Erro ao desativar");
    setExcluindo(null);
  }

  const getInitials = (name: string) => (name || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <Topbar title="Usuários & Permissões" subtitle="Gerenciamento de acessos ao sistema"
        actions={<Button onClick={openNew}><Plus size={15} /> Novo Usuário</Button>} />

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? <Loading /> : usuarios.length === 0 ? <Empty icon="👥" text="Nenhum usuário" /> : (
          <Card className="p-0 overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <Th>Usuário</Th><Th>Email</Th><Th>Role</Th>
                  <Th>Aprovado</Th><Th>Ativo</Th><Th>Cadastro</Th>
                  <Th>Fornecedores (portal)</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        {u.image ? (
                          <img src={u.image} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,var(--accent),#8b5cf6)" }}>
                            {getInitials(u.name)}
                          </div>
                        )}
                        <span className="font-semibold text-sm">{u.name || "—"}</span>
                      </div>
                    </Td>
                    <Td><span className="text-xs font-mono" style={{ color: "var(--text2)" }}>{u.email}</span></Td>
                    <Td><StatusBadge status={u.role} /></Td>
                    <Td>
                      <button onClick={() => toggleAprovado(u)}
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-all ${u.aprovado
                          ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/20"
                          : "bg-red-400/10 text-red-400 border border-red-400/30 hover:bg-red-400/20"}`}>
                        {u.aprovado ? <UserCheck size={12} /> : <UserX size={12} />}
                        {u.aprovado ? "Aprovado" : "Pendente"}
                      </button>
                    </Td>
                    <Td>
                      <button onClick={() => toggleAtivo(u)}
                        className={`text-xs px-2 py-1 rounded-lg transition-all ${u.ativo
                          ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/30"
                          : "bg-slate-400/10 text-slate-400 border border-slate-400/30"}`}>
                        {u.ativo ? "Ativo" : "Inativo"}
                      </button>
                    </Td>
                    <Td><span className="text-xs font-mono" style={{ color: "var(--text3)" }}>{formatDate(u.createdAt)}</span></Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {u.fornecedoresAutorizados?.slice(0, 2).map((f: any) => (
                          <span key={f.cnpjEmitente} className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: "var(--surface2)", color: "var(--text3)", border: "1px solid var(--border)" }}>
                            {f.cnpjEmitente.slice(0, 8)}...
                          </span>
                        ))}
                        {u.fornecedoresAutorizados?.length > 2 && (
                          <span className="text-[9px] font-mono" style={{ color: "var(--text3)" }}>+{u.fornecedoresAutorizados.length - 2}</span>
                        )}
                        {u.fornecedoresAutorizados?.length === 0 && <span className="text-[10px]" style={{ color: "var(--text3)" }}>—</span>}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEdit(u)} title="Editar" className="p-1.5 rounded-lg transition-all hover:opacity-70"
                          style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => openExcluir(u)} title="Excluir" className="p-1.5 rounded-lg transition-all hover:opacity-70"
                          style={{ background: "rgba(255,77,79,.1)", color: "#f87171" }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Editar Usuário" : "👤 Novo Usuário"} size="sm">
        <div className="space-y-4">
          <Input label="Nome *" value={form.name} onChange={(e) => set("name", e.target.value)} />
          <Input label="Email *" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={!!editing} />
          <Select label="Role / Perfil" value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="ADMIN">Admin — acesso total</option>
            <option value="FINANCEIRO">Financeiro — sem acesso a XMLs</option>
            <option value="OPERACIONAL">Operacional — sem financeiro</option>
            <option value="CONFERENTE">Conferente — apenas kanban</option>
            <option value="CLIENTE">Cliente — portal externo</option>
          </Select>
          <Input label={editing ? "Nova Senha (deixe vazio para manter)" : "Senha"} type="password"
            value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Mínimo 8 caracteres" />
          {form.role === "CLIENTE" && (
            <div>
              <Input label="CNPJs dos Emitentes Autorizados" value={form.fornecedores}
                onChange={(e) => set("fornecedores", e.target.value)}
                placeholder="00000000000100, 00000000000200" />
              <p className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>
                Separe por vírgula. O cliente só verá NFs desses emitentes no portal.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>{editing ? "Salvar" : "Criar"}</Button>
        </div>
      </Modal>

      <Modal open={!!excluindo} onClose={() => setExcluindo(null)} title="Excluir usuário" size="sm">
        {bloqueio ? (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text2)" }}>{bloqueio}</p>
            <div className="flex justify-end gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => setExcluindo(null)}>Fechar</Button>
              {excluindo?.ativo && <Button onClick={desativarEmVez}>Desativar em vez disso</Button>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text2)" }}>
              Excluir <b>{excluindo?.name || excluindo?.email}</b>? Ele some da lista, o e-mail fica livre e ele não entra mais.
              Isso não pode ser desfeito.
            </p>
            <div className="flex justify-end gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => setExcluindo(null)}>Cancelar</Button>
              <Button variant="danger" onClick={handleExcluir} loading={saving}>Excluir</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
