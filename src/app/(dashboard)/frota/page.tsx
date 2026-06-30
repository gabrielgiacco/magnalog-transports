"use client";
import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, Empty, Modal, Input, Select } from "@/components/ui";
import { Plus, Edit2, Phone, FileText, User as UserIcon, Truck as TruckIcon } from "lucide-react";

const B_MOT = { nome: "", cpf: "", cnh: "", categoriaCnh: "E", telefone: "", tipo: "TERCEIRO", valorDiaria: "" };
const B_VEI = { placa: "", tipo: "TRUCK", modelo: "", ano: "", capacidadeKg: "", motoristaId: "", donoId: "" };

const TIPOS: Record<string, { label: string; icon: string; color: string }> = {
  VUC:         { label: "VUC",          icon: "🚐", color: "#3b82f6" },
  TRES_QUARTOS: { label: "3/4",         icon: "🚚", color: "#8b5cf6" },
  TOCO:        { label: "Toco",         icon: "🚛", color: "#f59e0b" },
  TRUCK:       { label: "Truck",        icon: "🚛", color: "#f97316" },
  CARRETA:     { label: "Carreta",      icon: "🚛", color: "#ef4444" },
  BITRUCK:     { label: "Bitruck",      icon: "🚛", color: "#10b981" },
  UTILITARIO:  { label: "Utilitário",   icon: "🚙", color: "#14b8a6" },
};

export default function FrotaPage() {
  const [tab, setTab] = useState<"motoristas" | "veiculos">("motoristas");
  const [motoristas, setMotoristas] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [formType, setFormType] = useState<"motorista" | "veiculo">("motorista");
  const [formMot, setFormMot] = useState({ ...B_MOT });
  const [formVei, setFormVei] = useState({ ...B_VEI });
  const [saving, setSaving] = useState(false);

  const fetchLists = useCallback(async () => {
    setLoading(true);
    const [resMot, resVei] = await Promise.all([
      fetch("/api/motoristas").then(r => r.json()),
      fetch("/api/veiculos").then(r => r.json()),
    ]);
    setMotoristas(resMot);
    setVeiculos(resVei);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const setM = (k: string, v: string) => setFormMot((f) => ({ ...f, [k]: v }));
  const setV = (k: string, v: string) => setFormVei((f) => ({ ...f, [k]: v }));

  function openNewMot() { setFormType("motorista"); setEditing(null); setFormMot({ ...B_MOT }); setShowModal(true); }
  function openNewVei() { setFormType("veiculo"); setEditing(null); setFormVei({ ...B_VEI }); setShowModal(true); }

  function openEditMot(m: any) {
    setFormType("motorista"); setEditing(m);
    setFormMot({ nome: m.nome, cpf: m.cpf || "", cnh: m.cnh || "", categoriaCnh: m.categoriaCnh || "E", telefone: m.telefone || "", tipo: m.tipo || "TERCEIRO", valorDiaria: m.valorDiaria ? String(m.valorDiaria) : "" });
    setShowModal(true);
  }

  function openEditVei(v: any) {
    setFormType("veiculo"); setEditing(v);
    setFormVei({ placa: v.placa, tipo: v.tipo, modelo: v.modelo || "", ano: String(v.ano || ""), capacidadeKg: String(v.capacidadeKg || ""), motoristaId: v.motoristaId || "", donoId: v.donoId || "" });
    setShowModal(true);
  }

  async function handleSaveMot() {
    if (!formMot.nome) { toast.error("Nome obrigatório"); return; }
    setSaving(true);
    try {
      const method = editing ? "PUT" : "POST";
      const body = editing ? { id: editing.id, ...formMot } : formMot;
      const res = await fetch("/api/motoristas", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao salvar motorista");
      }
      toast.success(editing ? "Atualizado" : "Cadastrado");
      setShowModal(false); fetchLists();
    } catch (error: any) { toast.error(error.message || "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  async function handleSaveVei() {
    if (!formVei.placa || !formVei.tipo) { toast.error("Placa e tipo obrigatórios"); return; }
    setSaving(true);
    try {
      const method = editing ? "PUT" : "POST";
      const body = editing ? { id: editing.id, ...formVei } : formVei;
      const res = await fetch("/api/veiculos", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao salvar veículo");
      }
      toast.success(editing ? "Atualizado" : "Cadastrado");
      setShowModal(false); fetchLists();
    } catch (error: any) { toast.error(error.message || "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  const getInitials = (name: string) => name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <Topbar title="Frota" subtitle={`${motoristas.length} motoristas · ${veiculos.length} veículos`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={openNewMot}><UserIcon size={14}/> <span className="hidden sm:inline">Novo Motorista</span><span className="sm:hidden">Motorista</span></Button>
            <Button size="sm" onClick={openNewVei}><TruckIcon size={14}/> <span className="hidden sm:inline">Novo Veículo</span><span className="sm:hidden">Veículo</span></Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-4 px-3 sm:px-6 pt-3 sm:pt-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <button className={`pb-3 text-sm font-semibold transition-all border-b-2 px-1 ${tab === "motoristas" ? "text-blue-600 border-blue-600" : "text-slate-500 border-transparent hover:text-slate-800"}`} onClick={() => setTab("motoristas")}>
          Motoristas ({motoristas.length})
        </button>
        <button className={`pb-3 text-sm font-semibold transition-all border-b-2 px-1 ${tab === "veiculos" ? "text-blue-600 border-blue-600" : "text-slate-500 border-transparent hover:text-slate-800"}`} onClick={() => setTab("veiculos")}>
          Veículos ({veiculos.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        {loading ? <Loading /> : tab === "motoristas" ? (
          motoristas.length === 0 ? <Empty icon="" text="Nenhum motorista" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {motoristas.map((m) => (
                <Card key={m.id} className={`text-center transition-all p-3 sm:p-5 ${!m.ativo ? "opacity-50" : "hover:-translate-y-0.5"}`}>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-black text-white mx-auto mb-3"
                    style={{ background: "linear-gradient(135deg, var(--accent), #8b5cf6)" }}>
                    {getInitials(m.nome)}
                  </div>
                  <div className="font-semibold text-sm mb-0.5">{m.nome}</div>
                  <div className="text-[10px] font-mono mb-1 font-bold" style={{ color: m.tipo === "FROTA" ? "#3b82f6" : m.tipo === "DIARIA" ? "#10b981" : "#f97316" }}>
                    [{m.tipo}]
                  </div>
                  <div className="text-[10px] font-mono mb-3" style={{ color: "var(--text3)" }}>CNH {m.categoriaCnh || "—"}</div>
                  <div className="space-y-1.5 mb-4 text-xs" style={{ color: "var(--text2)" }}>
                    {m.telefone && <div>{m.telefone}</div>}
                    {m.cpf && <div className="font-mono">{m.cpf}</div>}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono mb-3">
                    <span style={{ color: "var(--text3)" }}>🚛 {m._count?.entregas ?? 0} fretes</span>
                    <span className={m.ativo ? "text-emerald-500" : "text-red-500"}>{m.ativo ? "Ativo" : "Inativo"}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => openEditMot(m)}><Edit2 size={12}/> Editar</Button>
                </Card>
              ))}
            </div>
          )
        ) : (
          veiculos.length === 0 ? <Empty icon="🚛" text="Nenhum veículo" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {veiculos.map((v) => {
                const tipo = TIPOS[v.tipo] || { label: v.tipo, icon: "🚛", color: "#64748b" };
                return (
                  <Card key={v.id} className={`transition-all p-3 sm:p-5 ${!v.ativo ? "opacity-50" : "hover:-translate-y-0.5"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl"
                        style={{ background: `${tipo.color}15`, border: `1px solid ${tipo.color}30` }}>{tipo.icon}</div>
                      <span className={`text-[9px] sm:text-[10px] font-mono ${v.ativo ? "text-emerald-500" : "text-red-500"}`}>{v.ativo ? "Ativo" : "Inativo"}</span>
                    </div>
                    <div className="font-head text-base sm:text-xl font-black tracking-widest mb-1 truncate" style={{ color: tipo.color }}>{v.placa}</div>
                    <div className="text-xs sm:text-sm font-semibold mb-1">{tipo.label}</div>
                    {v.motorista && <div className="text-[10px] sm:text-[11px] mb-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md inline-flex items-center gap-1.5 max-w-full truncate" title={`Motorista padrão: ${v.motorista.nome}`}><UserIcon size={10}/> <span className="truncate">{v.motorista.nome}</span></div>}
                    {v.dono && v.dono.id !== v.motoristaId && <div className="text-[10px] sm:text-[11px] mb-2 px-2 py-1 bg-amber-50 text-amber-700 rounded-md inline-flex items-center gap-1.5 max-w-full truncate" title={`Dono do veículo${v.dono.telefone ? ` · ${v.dono.telefone}` : ""}`}><span className="font-bold">👑</span> <span className="truncate">{v.dono.nome}</span></div>}
                    <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                      <span className="text-[9px] sm:text-[10px] font-mono ml-auto" style={{ color: "var(--text3)" }}>{v._count?.entregas ?? 0} fretes</span>
                    </div>
                    <div className="mt-3"><Button variant="ghost" size="sm" className="w-full" onClick={() => openEditVei(v)}><Edit2 size={12}/> Editar</Button></div>
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={formType === "motorista" ? (editing ? "Editar Motorista" : "👤 Novo Motorista") : (editing ? "Editar Veículo" : "🚛 Novo Veículo")} size="sm">
        {formType === "motorista" ? (
          <div className="space-y-4">
            <Input label="Nome *" value={formMot.nome} onChange={(e) => setM("nome", e.target.value)} />
            <Input label="CPF" value={formMot.cpf} onChange={(e) => setM("cpf", e.target.value)} placeholder="000.000.000-00" />
            <Input label="Nº CNH" value={formMot.cnh} onChange={(e) => setM("cnh", e.target.value)} />
            <Select label="Categoria CNH" value={formMot.categoriaCnh} onChange={(e) => setM("categoriaCnh", e.target.value)}>
              {["A", "B", "AB", "C", "D", "E", "AC", "AD", "AE"].map((c) => <option key={c} value={c}>Categoria {c}</option>)}
            </Select>
            <Input label="Telefone" value={formMot.telefone} onChange={(e) => setM("telefone", e.target.value)} placeholder="(11) 99999-9999" />
            
            <Select label="Tipo de Contrato" value={formMot.tipo} onChange={(e) => setM("tipo", e.target.value)}>
              <option value="TERCEIRO">Frete a Combinar (Terceiro)</option>
              <option value="FROTA">Salário Fixo (Frota Própria - Custo R$0)</option>
              <option value="DIARIA">Diária Fixa</option>
            </Select>

            {formMot.tipo === "DIARIA" && (
              <Input label="Valor da Diária (R$)" type="number" value={formMot.valorDiaria} onChange={(e) => setM("valorDiaria", e.target.value)} placeholder="200.00" />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Input label="Placa *" value={formVei.placa} onChange={(e) => setV("placa", e.target.value.toUpperCase())} placeholder="ABC1D23" />
            <Select label="Tipo *" value={formVei.tipo} onChange={(e) => setV("tipo", e.target.value)}>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </Select>
            <Input label="Modelo" value={formVei.modelo} onChange={(e) => setV("modelo", e.target.value)} placeholder="Ex: VW Constellation" />
            
            <Select label="Motorista Padrão" value={formVei.motoristaId} onChange={(e) => setV("motoristaId", e.target.value)}>
              <option value="">Sem vínculo</option>
              {motoristas.filter(m => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </Select>

            <Select label="Dono do Veículo" value={formVei.donoId} onChange={(e) => setV("donoId", e.target.value)}>
              <option value="">Sem dono cadastrado</option>
              {motoristas.filter(m => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </Select>

            <Input label="Capacidade (kg)" type="number" value={formVei.capacidadeKg} onChange={(e) => setV("capacidadeKg", e.target.value)} placeholder="14000" />
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
          <Button onClick={formType === "motorista" ? handleSaveMot : handleSaveVei} loading={saving}>Salvar</Button>
        </div>
      </Modal>
    </>
  );
}
