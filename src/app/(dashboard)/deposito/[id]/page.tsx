"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { ChevronLeft, Pencil, Trash2, RotateCcw, ArrowDownCircle, ArrowUpCircle, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, Input, Select, Textarea } from "@/components/ui";
import { AnexosCard } from "@/components/entrega/AnexosCard";
import { formatCNPJ } from "@/lib/utils";
import { TIPOS_ENTRADA, corDias, labelTipo, labelMotivo, fmtKg, fmtBRL, fmtData } from "../deposito-ui";
import { BaixaModal } from "../BaixaModal";

// Icone/cor por tipo de movimento — mesma paleta usada nos status da tela.
const ICONE_MOVIMENTO: Record<string, typeof ArrowDownCircle> = {
  ENTRADA: ArrowDownCircle, AJUSTE: SlidersHorizontal, BAIXA: ArrowUpCircle, ESTORNO: RefreshCw,
};
const LABEL_MOVIMENTO: Record<string, string> = {
  ENTRADA: "Entrada", AJUSTE: "Ajuste", BAIXA: "Baixa", ESTORNO: "Estorno",
};
const COR_MOVIMENTO: Record<string, string> = {
  ENTRADA: "#10b981", AJUSTE: "#3b82f6", BAIXA: "#f97316", ESTORNO: "#ef4444",
};

export default function DepositoItemPage() {
  const params = useParams()!;
  const id = params.id as string;
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [baixaItem, setBaixaItem] = useState<any>(null);

  const recarregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deposito/${id}`);
      const data = await res.json();
      setItem(data);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { recarregar(); }, [recarregar]);

  function iniciarEdicao() {
    setForm({
      descricao: item.descricao, volumes: item.volumes, pesoKg: item.pesoKg,
      valorMercadoria: item.valorMercadoria, localizacao: item.localizacao || "",
      notaNumero: item.notaNumero || "", notaSerie: item.notaSerie || "", notaChave: item.notaChave || "",
      observacoes: item.observacoes || "", embarcadorCnpj: item.embarcadorCnpj, embarcadorRazao: item.embarcadorRazao,
      tipoEntrada: item.tipoEntrada, dataEntrada: String(item.dataEntrada).slice(0, 10),
    });
    setEditando(true);
  }

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  async function salvar() {
    setSaving(true);
    try {
      const res = await fetch(`/api/deposito/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao salvar"); return; }
      setItem(data);
      setEditando(false);
      toast.success("Item atualizado");
    } catch { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  }

  async function handleEstornar() {
    if (!confirm("Estornar a última baixa deste item? Esta ação não pode ser desfeita.")) return;
    try {
      const res = await fetch(`/api/deposito/${id}/baixa`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || "Erro ao estornar"); return; }
      toast.success("Baixa estornada");
      recarregar();
    } catch { toast.error("Erro ao estornar"); }
  }

  async function handleExcluir() {
    if (!confirm("Excluir este item do depósito? Esta ação não pode ser desfeita.")) return;
    try {
      const res = await fetch(`/api/deposito/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || "Erro ao excluir"); return; }
      toast.success("Item excluído");
      router.push("/deposito");
    } catch { toast.error("Erro ao excluir"); }
  }

  if (loading) return <><Topbar title="Item do depósito" /><Loading /></>;
  if (!item || item.error) {
    return <><Topbar title="Não encontrado" /><div className="p-8 text-center" style={{ color: "var(--text3)" }}>Item não encontrado.</div></>;
  }

  const cor = corDias(item.diasParados);
  const temBaixaParaEstornar = item.volumesBaixados > 0;
  const movimentos: any[] = item.movimentos || [];

  return (
    <>
      <Topbar title={item.codigo} subtitle="Item do depósito" actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/deposito")}><ChevronLeft size={14} /> Voltar</Button>
          {item.status !== "BAIXADO" && <Button size="sm" onClick={() => setBaixaItem(item)}>Dar baixa</Button>}
          {temBaixaParaEstornar && (
            <Button variant="ghost" size="sm" onClick={handleEstornar}><RotateCcw size={13} /> Estornar baixa</Button>
          )}
          {isAdmin && <Button variant="danger" size="sm" onClick={handleExcluir}><Trash2 size={13} /> Excluir</Button>}
        </div>
      } />

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--text3)" }}>Dados do item</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: `${cor}15`, color: cor, border: `1px solid ${cor}30` }}>
                  {item.diasParados} dia(s) parado
                </span>
                {!editando ? (
                  <Button size="sm" variant="ghost" onClick={iniciarEdicao}><Pencil size={13} /> Editar</Button>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
                    <Button size="sm" onClick={salvar} loading={saving}>Salvar</Button>
                  </>
                )}
              </div>
            </div>

            <div className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>
              Saldo: {item.saldo} de {item.volumes} volumes
            </div>

            {editando ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><Textarea label="Descrição" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} /></div>
                <Input label="Volumes" type="number" min={1} value={form.volumes} onChange={(e) => set("volumes", Number(e.target.value))} />
                <Input label="Peso (kg)" type="number" step="0.01" value={form.pesoKg} onChange={(e) => set("pesoKg", Number(e.target.value))} />
                <Input label="Valor mercadoria" type="number" step="0.01" value={form.valorMercadoria} onChange={(e) => set("valorMercadoria", Number(e.target.value))} />
                <Input label="Localização" value={form.localizacao} onChange={(e) => set("localizacao", e.target.value)} />
                <Select label="Tipo de entrada" value={form.tipoEntrada} onChange={(e) => set("tipoEntrada", e.target.value)}>
                  {TIPOS_ENTRADA.map((t: any) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
                <Input label="Data de entrada" type="date" value={form.dataEntrada} onChange={(e) => set("dataEntrada", e.target.value)} />
                <Input label="Embarcador — Razão" value={form.embarcadorRazao} onChange={(e) => set("embarcadorRazao", e.target.value)} />
                <Input label="Embarcador — CNPJ" value={form.embarcadorCnpj} onChange={(e) => set("embarcadorCnpj", e.target.value)} />
                <Input label="Nota — Número" value={form.notaNumero} onChange={(e) => set("notaNumero", e.target.value)} />
                <Input label="Nota — Série" value={form.notaSerie} onChange={(e) => set("notaSerie", e.target.value)} />
                <div className="sm:col-span-2"><Input label="Nota — Chave de acesso" value={form.notaChave} onChange={(e) => set("notaChave", e.target.value)} /></div>
                <div className="sm:col-span-2"><Textarea label="Observações" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Descrição" value={item.descricao} full />
                <Field label="Tipo de entrada" value={labelTipo(item.tipoEntrada)} />
                <Field label="Volumes" value={String(item.volumes)} mono />
                <Field label="Peso" value={fmtKg(item.pesoKg)} mono />
                <Field label="Valor mercadoria" value={fmtBRL(item.valorMercadoria)} mono />
                <Field label="Localização" value={item.localizacao} />
                <Field label="Data de entrada" value={fmtData(item.dataEntrada)} mono />
                <Field label="Data de saída" value={item.dataSaida ? fmtData(item.dataSaida) : null} mono />
                <Field label="Embarcador" value={`${item.embarcadorRazao} — ${formatCNPJ(item.embarcadorCnpj)}`} full />
                <Field label="Nota fiscal" value={item.notaNumero ? `NF ${item.notaNumero}${item.notaSerie ? `/${item.notaSerie}` : ""}` : null} mono />
                <Field label="Chave de acesso" value={item.notaChave} mono />
                <Field label="Registrado por" value={item.registradoPor?.name} />
                {item.motivoBaixa && <Field label="Motivo da baixa" value={labelMotivo(item.motivoBaixa)} />}
                {item.observacoes && <Field label="Observações" value={item.observacoes} full />}
              </div>
            )}

            {(item.entregaId || item.avariaId) && (
              <div className="flex gap-4 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                {item.entregaId && (
                  <button onClick={() => router.push(`/entregas/${item.entregaId}`)} className="text-xs font-bold underline" style={{ color: "var(--accent)" }}>
                    Ver entrega de origem
                  </button>
                )}
                {item.avariaId && (
                  <button onClick={() => router.push(`/avarias/${item.avariaId}`)} className="text-xs font-bold underline" style={{ color: "var(--accent)" }}>
                    Ver avaria de origem
                  </button>
                )}
              </div>
            )}
          </Card>

          <Card>
            <span className="text-xs font-mono uppercase tracking-widest block mb-4" style={{ color: "var(--text3)" }}>Histórico</span>
            {movimentos.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: "var(--text3)" }}>Nenhuma movimentação registrada ainda.</p>
            ) : (
              <div>
                {movimentos.map((m, i) => {
                  const Icon = ICONE_MOVIMENTO[m.tipo] || SlidersHorizontal;
                  const corM = COR_MOVIMENTO[m.tipo] || "#64748b";
                  return (
                    <div key={m.id} className="flex gap-3 pb-4 relative">
                      {i < movimentos.length - 1 && (
                        <div className="absolute left-[13px] top-6 bottom-0 w-px" style={{ background: "var(--border)" }} />
                      )}
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                        style={{ background: `${corM}15`, border: `1px solid ${corM}40` }}>
                        <Icon size={13} style={{ color: corM }} />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold" style={{ color: corM }}>{LABEL_MOVIMENTO[m.tipo] || m.tipo}</span>
                          <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{m.volumes} vol.</span>
                        </div>
                        {m.motivo && <div className="text-[11px] mt-0.5" style={{ color: "var(--text2)" }}>{labelMotivo(m.motivo)}</div>}
                        {m.observacoes && <div className="text-[11px] mt-0.5" style={{ color: "var(--text2)" }}>{m.observacoes}</div>}
                        <div className="text-[10px] mt-1 flex flex-wrap gap-x-2" style={{ color: "var(--text3)" }}>
                          {m.responsavel && <span>{m.responsavel}</span>}
                          {m.documento && <span className="font-mono">{m.documento}</span>}
                          <span>{m.usuario?.name || "—"}</span>
                          <span className="font-mono">{fmtData(m.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <AnexosCard
          apiBase={`/api/deposito/${id}/anexos`}
          tiposPermitidos={["FOTO", "DOCUMENTO", "DECLARACAO", "OUTRO"]}
          tipoDefault="FOTO"
          titulo="Fotos da mercadoria"
        />
      </div>

      <BaixaModal item={baixaItem} onClose={() => setBaixaItem(null)} onBaixado={recarregar} />
    </>
  );
}

function Field({ label, value, mono, full }: { label: string; value?: string | null; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[9px] font-mono uppercase tracking-widest mb-0.5" style={{ color: "var(--text3)" }}>{label}</div>
      <div className={`text-sm font-medium ${mono ? "font-mono text-xs" : ""}`} style={{ color: value ? "var(--text)" : "var(--text3)" }}>
        {value || "—"}
      </div>
    </div>
  );
}
