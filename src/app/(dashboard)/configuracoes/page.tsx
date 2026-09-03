"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Topbar } from "@/components/layout/Topbar";
import { Card, Button, Input, Select } from "@/components/ui";
import toast from "react-hot-toast";
import { Settings, User, Shield, Bell, Globe, Palette, Save, Warehouse, Plus, Trash2, Edit2, PackageOpen, Receipt, MessageCircle } from "lucide-react";

const TCK_VAZIO = {
  cnpjEmbarcador: "", nomeEmbarcador: "", whatsapp: "", emailsPara: "", emailsCopia: "",
  assuntoModelo: "SOLICITAÇÃO DE TICKET - NF {NF}", textoIntro: "Boa tarde!\n\nSegue solicitação de ticket abaixo,", textoAssinatura: "",
  valorPalete: "0", percentualReentrega: "80",
  diariaVuc: "0", diariaTresQuartos: "0", diariaToco: "0", diariaTruck: "0",
  diariaCarreta: "0", diariaBitruck: "0", diariaUtilitario: "0",
  aliqIrpj: "8", aliqCsll: "12", aliqCofins: "7.6", aliqPis: "1.65", aliqIss: "3",
};

const CAMPOS_DIARIA: { key: keyof typeof TCK_VAZIO; label: string }[] = [
  { key: "diariaVuc", label: "VUC" },
  { key: "diariaTresQuartos", label: "3/4" },
  { key: "diariaToco", label: "Toco" },
  { key: "diariaTruck", label: "Truck" },
  { key: "diariaCarreta", label: "Carreta" },
  { key: "diariaBitruck", label: "Bitruck" },
  { key: "diariaUtilitario", label: "Utilitário" },
];

const CAMPOS_ALIQUOTA: { key: keyof typeof TCK_VAZIO; label: string }[] = [
  { key: "aliqIrpj", label: "IRPJ %" },
  { key: "aliqCsll", label: "CSLL %" },
  { key: "aliqCofins", label: "COFINS %" },
  { key: "aliqPis", label: "PIS %" },
  { key: "aliqIss", label: "ISS %" },
];

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-3 mb-5" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "14px" }}>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(249,115,22,.1)", border: "1px solid rgba(249,115,22,.2)" }}
        >
          <Icon size={15} style={{ color: "var(--accent)" }} />
        </div>
        <h2 className="font-head text-sm font-bold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

export default function ConfiguracoesPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  const [senhaForm, setSenhaForm] = useState({ atual: "", nova: "", confirmar: "" });
  const [saving, setSaving] = useState(false);

  // Armazenagem (admin only)
  const [tabelas, setTabelas] = useState<any[]>([]);
  const [loadingTabelas, setLoadingTabelas] = useState(false);
  const [armForm, setArmForm] = useState({ cnpjCliente: "", nomeCliente: "", diasFree: "0", valorPaleteDia: "0" });
  const [editingArm, setEditingArm] = useState<string | null>(null);
  const [savingArm, setSavingArm] = useState(false);

  // Descarga (admin only)
  const [descargas, setDescargas] = useState<any[]>([]);
  const [loadingDescargas, setLoadingDescargas] = useState(false);
  const [descForm, setDescForm] = useState({ cnpjCliente: "", nomeCliente: "", tipo: "SEM_VALOR", valorPalete: "0", valorAjudante: "0", observacoes: "" });
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [savingDesc, setSavingDesc] = useState(false);

  // Valores de Ticket por embarcador (admin only)
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [tckForm, setTckForm] = useState({ ...TCK_VAZIO });
  const [editingTck, setEditingTck] = useState<string | null>(null);
  const [savingTck, setSavingTck] = useState(false);

  // WhatsApp (Pingo Notify)
  const [whats, setWhats] = useState<any>(null);
  const [loadingWhats, setLoadingWhats] = useState(false);
  const [savingWhats, setSavingWhats] = useState(false);

  const fetchTickets = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    setLoadingTickets(true);
    try {
      const res = await fetch("/api/tickets/tabelas");
      if (res.ok) setTickets(await res.json());
    } finally { setLoadingTickets(false); }
  }, [user?.role]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const fetchWhats = useCallback(async () => {
    setLoadingWhats(true);
    try {
      const res = await fetch("/api/whatsapp/config");
      if (res.ok) setWhats(await res.json());
    } finally { setLoadingWhats(false); }
  }, []);

  useEffect(() => { fetchWhats(); }, [fetchWhats]);

  async function handleSaveWhats(mudanca: Record<string, any>) {
    if (!whats) return;
    setSavingWhats(true);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...whats.config, ...mudanca }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || d.error || "Erro ao salvar");
      setWhats({ ...whats, config: d.config, cota: d.cota });
      toast.success("Configuração salva");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally { setSavingWhats(false); }
  }

  async function handleSaveTck() {
    if (!tckForm.cnpjEmbarcador || !tckForm.nomeEmbarcador) { toast.error("CNPJ e nome do embarcador são obrigatórios"); return; }
    setSavingTck(true);
    try {
      const res = await fetch("/api/tickets/tabelas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tckForm),
      });
      if (!res.ok) throw new Error();
      toast.success(editingTck ? "Valores atualizados" : "Embarcador adicionado");
      setTckForm({ ...TCK_VAZIO });
      setEditingTck(null);
      fetchTickets();
    } catch { toast.error("Erro ao salvar"); }
    finally { setSavingTck(false); }
  }

  async function handleDeleteTck(id: string) {
    if (!confirm("Excluir os valores de ticket deste embarcador?")) return;
    await fetch("/api/tickets/tabelas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchTickets();
    toast.success("Registro removido");
  }

  function startEditTck(t: any) {
    setEditingTck(t.id);
    const f: any = { ...TCK_VAZIO };
    for (const k of Object.keys(TCK_VAZIO)) f[k] = t[k] == null ? "" : String(t[k]);
    setTckForm(f);
  }

  const fetchTabelas = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    setLoadingTabelas(true);
    try {
      const res = await fetch("/api/armazenagem");
      if (res.ok) setTabelas(await res.json());
    } finally { setLoadingTabelas(false); }
  }, [user?.role]);

  useEffect(() => { fetchTabelas(); }, [fetchTabelas]);

  const fetchDescargas = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    setLoadingDescargas(true);
    try {
      const res = await fetch("/api/descarga");
      if (res.ok) setDescargas(await res.json());
    } finally { setLoadingDescargas(false); }
  }, [user?.role]);

  useEffect(() => { fetchDescargas(); }, [fetchDescargas]);

  async function handleSaveDesc() {
    if (!descForm.cnpjCliente || !descForm.nomeCliente) { toast.error("CNPJ e nome são obrigatórios"); return; }
    setSavingDesc(true);
    try {
      const res = await fetch("/api/descarga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpjCliente: descForm.cnpjCliente,
          nomeCliente: descForm.nomeCliente,
          tipo: descForm.tipo,
          valorPalete: parseFloat(descForm.valorPalete) || 0,
          valorAjudante: parseFloat(descForm.valorAjudante) || 0,
          observacoes: descForm.observacoes || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(editingDesc ? "Tabela atualizada" : "Tabela adicionada");
      setDescForm({ cnpjCliente: "", nomeCliente: "", tipo: "SEM_VALOR", valorPalete: "0", valorAjudante: "0", observacoes: "" });
      setEditingDesc(null);
      fetchDescargas();
    } catch { toast.error("Erro ao salvar"); }
    finally { setSavingDesc(false); }
  }

  async function handleDeleteDesc(id: string) {
    if (!confirm("Excluir esta tabela de descarga?")) return;
    await fetch("/api/descarga", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchDescargas();
    toast.success("Tabela removida");
  }

  function startEditDesc(t: any) {
    setEditingDesc(t.id);
    setDescForm({
      cnpjCliente: t.cnpjCliente,
      nomeCliente: t.nomeCliente,
      tipo: t.tipo,
      valorPalete: String(t.valorPalete),
      valorAjudante: String(t.valorAjudante),
      observacoes: t.observacoes || "",
    });
  }

  async function handleSaveArm() {
    if (!armForm.cnpjCliente || !armForm.nomeCliente) { toast.error("CNPJ e nome são obrigatórios"); return; }
    setSavingArm(true);
    try {
      const res = await fetch("/api/armazenagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpjCliente: armForm.cnpjCliente,
          nomeCliente: armForm.nomeCliente,
          diasFree: parseInt(armForm.diasFree) || 0,
          valorPaleteDia: parseFloat(armForm.valorPaleteDia) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(editingArm ? "Tabela atualizada" : "Tabela adicionada");
      setArmForm({ cnpjCliente: "", nomeCliente: "", diasFree: "0", valorPaleteDia: "0" });
      setEditingArm(null);
      fetchTabelas();
    } catch { toast.error("Erro ao salvar"); }
    finally { setSavingArm(false); }
  }

  async function handleDeleteArm(id: string) {
    if (!confirm("Excluir esta tabela de armazenagem?")) return;
    await fetch("/api/armazenagem", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchTabelas();
    toast.success("Tabela removida");
  }

  function startEditArm(t: any) {
    setEditingArm(t.id);
    setArmForm({
      cnpjCliente: t.cnpjCliente,
      nomeCliente: t.nomeCliente,
      diasFree: String(t.diasFree),
      valorPaleteDia: String(t.valorPaleteDia),
    });
  }

  async function handleSenha() {
    if (!senhaForm.atual) {
      toast.error("Informe a senha atual");
      return;
    }
    if (!senhaForm.nova || senhaForm.nova.length < 6) {
      toast.error("Nova senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (senhaForm.nova !== senhaForm.confirmar) {
      toast.error("As senhas não coincidem");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user?.id, senhaAtual: senhaForm.atual, password: senhaForm.nova }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao alterar senha");
      }
      toast.success("Senha alterada com sucesso");
      setSenhaForm({ atual: "", nova: "", confirmar: "" });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Topbar title="Configurações" subtitle="Preferências do sistema" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-5">
          {/* Perfil */}
          <Section icon={User} title="Perfil do Usuário">
            <div className="flex items-center gap-4 mb-5">
              {user?.image ? (
                <img src={user.image} alt="" className="w-14 h-14 rounded-full" />
              ) : (
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white"
                  style={{ background: "linear-gradient(135deg, var(--accent), #8b5cf6)" }}
                >
                  {(user?.name || "?")[0].toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-semibold text-sm">{user?.name}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text3)" }}>
                  {user?.email}
                </div>
                <div className="mt-1">
                  <span className={`badge badge-${user?.role}`}>{user?.role}</span>
                </div>
              </div>
            </div>
            <p className="text-xs" style={{ color: "var(--text3)" }}>
              Para alterar nome ou email, contate o administrador do sistema.
            </p>
          </Section>

          {/* Segurança */}
          <Section icon={Shield} title="Segurança">
            <div className="space-y-4">
              <Input
                label="Senha Atual"
                type="password"
                value={senhaForm.atual}
                onChange={(e) => setSenhaForm((f) => ({ ...f, atual: e.target.value }))}
                placeholder="••••••••"
              />
              <Input
                label="Nova Senha"
                type="password"
                value={senhaForm.nova}
                onChange={(e) => setSenhaForm((f) => ({ ...f, nova: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
              />
              <Input
                label="Confirmar Nova Senha"
                type="password"
                value={senhaForm.confirmar}
                onChange={(e) => setSenhaForm((f) => ({ ...f, confirmar: e.target.value }))}
                placeholder="Repita a nova senha"
              />
              <Button onClick={handleSenha} loading={saving} size="sm">
                <Save size={14} /> Alterar Senha
              </Button>
            </div>
          </Section>

          {/* Tabela de Armazenagem — admin only */}
          {user?.role === "ADMIN" && (
            <Section icon={Warehouse} title="Tabela de Armazenagem por Cliente">
              <p className="text-xs mb-4" style={{ color: "var(--text3)" }}>
                Configure dias free e valor por palete/dia para cada cliente. O cálculo automático usa: (dias armazenados - dias free) x paletes x valor/dia.
              </p>

              {/* Form */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Input label="CNPJ do Cliente" value={armForm.cnpjCliente} disabled={!!editingArm}
                  onChange={(e) => setArmForm((f) => ({ ...f, cnpjCliente: e.target.value }))} placeholder="00.000.000/0001-00" />
                <Input label="Nome / Razão Social" value={armForm.nomeCliente}
                  onChange={(e) => setArmForm((f) => ({ ...f, nomeCliente: e.target.value }))} placeholder="Ex: Unicharm" />
                <Input label="Dias Free" type="number" value={armForm.diasFree}
                  onChange={(e) => setArmForm((f) => ({ ...f, diasFree: e.target.value }))} placeholder="15" />
                <Input label="R$ / Palete / Dia" type="number" step="0.01" value={armForm.valorPaleteDia}
                  onChange={(e) => setArmForm((f) => ({ ...f, valorPaleteDia: e.target.value }))} placeholder="7.00" />
              </div>
              <div className="flex gap-2 mb-5">
                <Button size="sm" onClick={handleSaveArm} loading={savingArm}>
                  {editingArm ? <><Save size={13} /> Atualizar</> : <><Plus size={13} /> Adicionar</>}
                </Button>
                {editingArm && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingArm(null);
                    setArmForm({ cnpjCliente: "", nomeCliente: "", diasFree: "0", valorPaleteDia: "0" });
                  }}>Cancelar</Button>
                )}
              </div>

              {/* Lista */}
              {loadingTabelas ? (
                <p className="text-xs text-center py-4" style={{ color: "var(--text3)" }}>Carregando...</p>
              ) : tabelas.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: "var(--text3)" }}>Nenhuma tabela cadastrada</p>
              ) : (
                <div className="space-y-2">
                  {tabelas.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{t.nomeCliente}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                          CNPJ: {t.cnpjCliente} &bull; {t.diasFree} dias free &bull; R$ {Number(t.valorPaleteDia).toFixed(2)}/palete/dia
                        </div>
                      </div>
                      <div className="flex gap-1.5 ml-3">
                        <button onClick={() => startEditArm(t)} className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                          style={{ background: "var(--surface)", color: "var(--text2)" }}>
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => handleDeleteArm(t.id)} className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                          style={{ background: "rgba(239,68,68,.1)", color: "#ef4444" }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Tabela de Descarga — admin only */}
          {user?.role === "ADMIN" && (
            <Section icon={PackageOpen} title="Tabela de Descarga por Cliente">
              <p className="text-xs mb-4" style={{ color: "var(--text3)" }}>
                Configure o modelo de cobrança da descarga por cliente. 3 tipos:
                <b> Por Palete</b> (R$ × qtd de paletes) ·
                <b> Por Ajudante</b> (R$ × 1 ajudante em Truck/Toco/menores, × 2 em Carreta) ·
                <b> Sem Valor</b> (registro manual, sem cálculo).
              </p>

              {/* Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <Input label="CNPJ do Cliente" value={descForm.cnpjCliente} disabled={!!editingDesc}
                  onChange={(e) => setDescForm((f) => ({ ...f, cnpjCliente: e.target.value }))} placeholder="00.000.000/0001-00" />
                <Input label="Nome / Razão Social" value={descForm.nomeCliente}
                  onChange={(e) => setDescForm((f) => ({ ...f, nomeCliente: e.target.value }))} placeholder="Ex: Softys" />
                <Select label="Tipo de Cobrança" value={descForm.tipo}
                  onChange={(e) => setDescForm((f) => ({ ...f, tipo: e.target.value }))}>
                  <option value="POR_PALETE">Por Palete (R$ × paletes)</option>
                  <option value="POR_AJUDANTE">Por Ajudante (Carreta=2, Truck ou menor=1)</option>
                  <option value="SEM_VALOR">Sem Valor Estipulado (manual)</option>
                </Select>
                {descForm.tipo === "POR_PALETE" && (
                  <Input label="R$ / Palete" type="number" step="0.01" value={descForm.valorPalete}
                    onChange={(e) => setDescForm((f) => ({ ...f, valorPalete: e.target.value }))} placeholder="35.00" />
                )}
                {descForm.tipo === "POR_AJUDANTE" && (
                  <Input label="R$ / Ajudante" type="number" step="0.01" value={descForm.valorAjudante}
                    onChange={(e) => setDescForm((f) => ({ ...f, valorAjudante: e.target.value }))} placeholder="110.00" />
                )}
                {descForm.tipo === "SEM_VALOR" && (
                  <Input label="Observações (opcional)" value={descForm.observacoes}
                    onChange={(e) => setDescForm((f) => ({ ...f, observacoes: e.target.value }))} placeholder="Ex: negociar por entrega" />
                )}
              </div>
              <div className="flex gap-2 mb-5">
                <Button size="sm" onClick={handleSaveDesc} loading={savingDesc}>
                  {editingDesc ? <><Save size={13} /> Atualizar</> : <><Plus size={13} /> Adicionar</>}
                </Button>
                {editingDesc && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingDesc(null);
                    setDescForm({ cnpjCliente: "", nomeCliente: "", tipo: "SEM_VALOR", valorPalete: "0", valorAjudante: "0", observacoes: "" });
                  }}>Cancelar</Button>
                )}
              </div>

              {/* Lista */}
              {loadingDescargas ? (
                <p className="text-xs text-center py-4" style={{ color: "var(--text3)" }}>Carregando...</p>
              ) : descargas.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: "var(--text3)" }}>Nenhuma tabela cadastrada</p>
              ) : (
                <div className="space-y-2">
                  {descargas.map((t) => {
                    const badge =
                      t.tipo === "POR_PALETE" ? { label: `R$ ${Number(t.valorPalete).toFixed(2)}/palete`, color: "#10b981" } :
                      t.tipo === "POR_AJUDANTE" ? { label: `R$ ${Number(t.valorAjudante).toFixed(2)}/ajudante`, color: "#3b82f6" } :
                      { label: "Sem valor", color: "#94a3b8" };
                    return (
                      <div key={t.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold">{t.nomeCliente}</div>
                          <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text3)" }}>
                            CNPJ: {t.cnpjCliente}
                          </div>
                          <div className="mt-1">
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: `${badge.color}22`, color: badge.color }}>
                              {badge.label}
                            </span>
                            {t.observacoes && <span className="ml-2 text-[10px]" style={{ color: "var(--text3)" }}>· {t.observacoes}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1.5 ml-3">
                          <button onClick={() => startEditDesc(t)} className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                            style={{ background: "var(--surface)", color: "var(--text2)" }}>
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => handleDeleteDesc(t.id)} className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                            style={{ background: "rgba(239,68,68,.1)", color: "#ef4444" }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          )}

          {/* Valores de Ticket por embarcador — admin only */}
          {user?.role === "ADMIN" && (
            <Section icon={Receipt} title="Valores de Ticket por Embarcador">
              <p className="text-xs mb-4" style={{ color: "var(--text3)" }}>
                Alimenta a <b>Solicitação de Aprovação de Ticket</b> gerada na tela da entrega. O embarcador é o{" "}
                <b>emitente da nota fiscal</b> (ex: Unicharm) — não o cliente de destino. A armazenagem continua vindo da
                tabela própria acima.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <Input label="CNPJ do Embarcador" value={tckForm.cnpjEmbarcador} disabled={!!editingTck}
                  onChange={(e) => setTckForm((f) => ({ ...f, cnpjEmbarcador: e.target.value }))} placeholder="00.000.000/0001-00" />
                <Input label="Nome / Razão Social" value={tckForm.nomeEmbarcador}
                  onChange={(e) => setTckForm((f) => ({ ...f, nomeEmbarcador: e.target.value }))} placeholder="Ex: Unicharm do Brasil" />
                <Input label="WhatsApp (aviso de entrega concluída)" value={tckForm.whatsapp}
                  onChange={(e) => setTckForm((f) => ({ ...f, whatsapp: e.target.value }))} placeholder="(11) 99999-9999" />
                <Input label='E-mails "Para" (separados por vírgula)' value={tckForm.emailsPara}
                  onChange={(e) => setTckForm((f) => ({ ...f, emailsPara: e.target.value }))} placeholder="customer-service@cliente.com" />
                <Input label='E-mails "Cópia"' value={tckForm.emailsCopia}
                  onChange={(e) => setTckForm((f) => ({ ...f, emailsCopia: e.target.value }))} placeholder="financeiro@magnalog.com.br" />
              </div>

              <div className="mb-3">
                <Input label="Assunto padrão" value={tckForm.assuntoModelo}
                  onChange={(e) => setTckForm((f) => ({ ...f, assuntoModelo: e.target.value }))} />
                <div className="text-[10px] mt-1" style={{ color: "var(--text3)" }}>
                  Use <code>{"{NF}"}</code>, <code>{"{CLIENTE}"}</code> e <code>{"{DATA}"}</code> — são substituídos na hora de gerar.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <Input label="R$ / Palete (paletização)" type="number" step="0.01" value={tckForm.valorPalete}
                  onChange={(e) => setTckForm((f) => ({ ...f, valorPalete: e.target.value }))} placeholder="39.00" />
                <Input label="% da reentrega sobre o frete" type="number" step="0.01" value={tckForm.percentualReentrega}
                  onChange={(e) => setTckForm((f) => ({ ...f, percentualReentrega: e.target.value }))} placeholder="80" />
              </div>

              <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--text3)" }}>
                Diária por perfil de veículo (R$)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {CAMPOS_DIARIA.map((c) => (
                  <Input key={c.key} label={c.label} type="number" step="0.01" value={tckForm[c.key]}
                    onChange={(e) => setTckForm((f) => ({ ...f, [c.key]: e.target.value }))} placeholder="0.00" />
                ))}
              </div>

              <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--text3)" }}>
                Impostos somados ao valor da descarga
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                {CAMPOS_ALIQUOTA.map((c) => (
                  <Input key={c.key} label={c.label} type="number" step="0.01" value={tckForm[c.key]}
                    onChange={(e) => setTckForm((f) => ({ ...f, [c.key]: e.target.value }))} />
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: "var(--text3)" }}>
                    Texto de introdução do e-mail
                  </label>
                  <textarea rows={3} value={tckForm.textoIntro}
                    onChange={(e) => setTckForm((f) => ({ ...f, textoIntro: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: "var(--text3)" }}>
                    Assinatura
                  </label>
                  <textarea rows={3} value={tckForm.textoAssinatura}
                    onChange={(e) => setTckForm((f) => ({ ...f, textoAssinatura: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
              </div>

              <div className="flex gap-2 mb-5">
                <Button size="sm" onClick={handleSaveTck} loading={savingTck}>
                  {editingTck ? <><Save size={13} /> Atualizar</> : <><Plus size={13} /> Adicionar</>}
                </Button>
                {editingTck && (
                  <Button size="sm" variant="ghost" onClick={() => { setEditingTck(null); setTckForm({ ...TCK_VAZIO }); }}>
                    Cancelar
                  </Button>
                )}
              </div>

              {loadingTickets ? (
                <p className="text-xs text-center py-4" style={{ color: "var(--text3)" }}>Carregando...</p>
              ) : tickets.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: "var(--text3)" }}>Nenhum embarcador cadastrado</p>
              ) : (
                <div className="space-y-2">
                  {tickets.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{t.nomeEmbarcador}</div>
                        <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text3)" }}>
                          CNPJ: {t.cnpjEmbarcador}{t.whatsapp ? ` · zap ${t.whatsapp}` : ""}{t.emailsPara ? ` · ${t.emailsPara}` : ""}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "#10b98122", color: "#10b981" }}>
                            R$ {Number(t.valorPalete).toFixed(2)}/palete
                          </span>
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "#3b82f622", color: "#3b82f6" }}>
                            Reentrega {Number(t.percentualReentrega).toFixed(0)}%
                          </span>
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "#f9731622", color: "#f97316" }}>
                            Carreta R$ {Number(t.diariaCarreta).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1.5 ml-3">
                        <button onClick={() => startEditTck(t)} className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                          style={{ background: "var(--surface)", color: "var(--text2)" }}>
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => handleDeleteTck(t.id)} className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                          style={{ background: "rgba(239,68,68,.1)", color: "#ef4444" }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* WhatsApp (Pingo Notify) */}
          <Section icon={MessageCircle} title="WhatsApp (Pingo Notify)">
            {loadingWhats || !whats ? (
              <div className="text-sm" style={{ color: "var(--text3)" }}>Carregando...</div>
            ) : (
              <div className="space-y-4">
                {!whats.credenciaisConfiguradas && (
                  <div className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)" }}>
                    <Bell size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm" style={{ color: "var(--text2)" }}>
                      Faltam as variáveis <code>PINGO_API_KEY</code> e <code>PINGO_CONNECTION_ID</code> no
                      ambiente. Sem elas o envio pelo sistema não funciona — só o link do WhatsApp.
                    </p>
                  </div>
                )}

                {/* Consumo da cota */}
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-sm font-medium">
                      {whats.cota.usadas} de {whats.cota.cotaMensal} mensagens
                    </span>
                    <span className="text-xs" style={{ color: "var(--text3)" }}>
                      {whats.cota.competencia}
                    </span>
                  </div>
                  <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (whats.cota.usadas / Math.max(1, whats.cota.cotaMensal)) * 100)}%`,
                        background:
                          whats.cota.estado === "esgotada" ? "#ef4444"
                          : whats.cota.estado === "reserva" ? "#f59e0b"
                          : "#25d366",
                      }}
                    />
                    {/* Marca onde começa a reserva */}
                    <div
                      className="absolute top-0 h-full w-px"
                      style={{
                        left: `${Math.min(100, (whats.cota.limiteReserva / Math.max(1, whats.cota.cotaMensal)) * 100)}%`,
                        background: "var(--text3)",
                      }}
                      title={`Reserva a partir da ${whats.cota.limiteReserva}ª`}
                    />
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: "var(--text3)" }}>
                    Restam {whats.cota.restantes}. A partir da {whats.cota.limiteReserva}ª só ADMIN envia.
                    Depois disso, sobra o link do WhatsApp — que não gasta cota.
                  </p>
                </div>

                {user?.role === "ADMIN" && (
                  <>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={whats.config.ativo}
                        disabled={savingWhats}
                        onChange={(e) => handleSaveWhats({ ativo: e.target.checked })}
                        className="mt-0.5 accent-orange-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-sm font-medium">Envio pelo sistema ativo</div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--text3)" }}>
                          Desligado, o modal de aviso só oferece o link do WhatsApp
                        </div>
                      </div>
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="Cota mensal"
                        type="number"
                        defaultValue={whats.config.cotaMensal}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== whats.config.cotaMensal) handleSaveWhats({ cotaMensal: v });
                        }}
                      />
                      <Input
                        label="Travar a partir de"
                        type="number"
                        defaultValue={whats.config.limiteReserva}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== whats.config.limiteReserva) handleSaveWhats({ limiteReserva: v });
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Últimas mensagens */}
                <div>
                  <div className="text-[10px] uppercase tracking-widest font-mono mb-2" style={{ color: "var(--text3)" }}>
                    Últimos envios
                  </div>
                  {whats.mensagens.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--text3)" }}>Nenhuma mensagem enviada ainda.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {whats.mensagens.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between gap-3 text-xs py-1.5 px-2.5 rounded-lg"
                          style={{ background: "var(--surface2)" }}>
                          <span className="truncate" title={m.erro || undefined}>
                            {m.entrega?.codigo ? `${m.entrega.codigo} · ` : ""}{m.destinatario}
                          </span>
                          <span className="flex-shrink-0" style={{ color: m.status === "ENVIADA" ? "#25d366" : "#ef4444" }}>
                            {m.status === "ENVIADA" ? "enviada" : "falhou"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Section>

          {/* Sistema */}
          <Section icon={Settings} title="Sistema">
            <div className="grid grid-cols-2 gap-4">
              <Select label="Itens por página padrão">
                <option value="25">25 itens</option>
                <option value="50" selected>50 itens</option>
                <option value="100">100 itens</option>
              </Select>
              <Select label="Fuso horário">
                <option value="America/Sao_Paulo">São Paulo (GMT-3)</option>
                <option value="America/Manaus">Manaus (GMT-4)</option>
                <option value="America/Belem">Belém (GMT-3)</option>
              </Select>
              <Select label="Formato de data">
                <option value="dd/MM/yyyy">DD/MM/AAAA</option>
                <option value="MM/dd/yyyy">MM/DD/AAAA</option>
              </Select>
              <Select label="Moeda">
                <option value="BRL">Real Brasileiro (R$)</option>
              </Select>
            </div>
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                MagnaLog TMS v1.0 · Next.js 14 · PostgreSQL · Prisma ORM
              </p>
            </div>
          </Section>

          {/* Info do sistema */}
          <Section icon={Globe} title="Rastreamento Público">
            <div className="p-3 rounded-xl" style={{ background: "var(--surface2)" }}>
              <p className="text-sm mb-2" style={{ color: "var(--text2)" }}>
                Compartilhe o link abaixo com clientes para rastrear entregas sem login:
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 text-xs font-mono px-3 py-2 rounded-lg"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--accent)" }}
                >
                  {typeof window !== "undefined" ? window.location.origin : "https://seu-dominio.com"}/entrega/[ID_DA_ENTREGA]
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const base = window.location.origin;
                    navigator.clipboard.writeText(`${base}/entrega/`);
                    toast.success("Base URL copiada!");
                  }}
                >
                  Copiar
                </Button>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
