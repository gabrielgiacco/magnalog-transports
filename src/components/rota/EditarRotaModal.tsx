"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Modal, Select, Textarea } from "@/components/ui";
import { etapasParaVoltar } from "@/lib/rota-etapa";
import { STATUS_LABELS } from "@/lib/utils";

type Opcao = { id: string; nome?: string; placa?: string; tipo?: string };

// Data da rota vem em ISO; o input quer YYYY-MM-DD (corte da string, sem fuso)
const dia = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

/**
 * Editar a rota como se edita a entrega: data, motorista, veículo, valor,
 * observações e voltar a etapa (ex.: Em Rota → Carregado). Só manda o que
 * mudou — trocar o motorista sem mexer no valor deixa a API recalcular a diária.
 */
export function EditarRotaModal({ rota, etapa, motoristas, veiculos, open, onClose, onSaved }: {
  rota: any; etapa: string | null; motoristas: Opcao[]; veiculos: Opcao[];
  open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const inicial = () => ({
    data: dia(rota?.data),
    motoristaId: rota?.motoristaId || "",
    veiculoId: rota?.veiculoId || "",
    valorMotorista: String(rota?.valorMotorista ?? 0),
    observacoes: rota?.observacoes || "",
    voltarPara: "",
  });
  const [form, setForm] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const opcoesVoltar = etapasParaVoltar(etapa);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setForm(inicial()); }, [open]);

  const set = (k: keyof ReturnType<typeof inicial>) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar() {
    const orig = inicial();
    const body: Record<string, unknown> = {};
    if (form.data && form.data !== orig.data) body.data = new Date(form.data + "T12:00:00").toISOString();
    if (form.motoristaId !== orig.motoristaId) body.motoristaId = form.motoristaId;
    if (form.veiculoId !== orig.veiculoId) body.veiculoId = form.veiculoId;
    if (Number(form.valorMotorista) !== Number(orig.valorMotorista)) body.valorMotorista = form.valorMotorista;
    if (form.observacoes !== orig.observacoes) body.observacoes = form.observacoes;
    if (form.voltarPara) body.etapa = form.voltarPara;
    if (Object.keys(body).length === 0) { onClose(); return; }

    setSalvando(true);
    try {
      const res = await fetch(`/api/rotas/${rota.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Erro ao salvar a rota");
      }
      toast.success(form.voltarPara ? `Rota voltou para ${STATUS_LABELS[form.voltarPara]}` : "Rota atualizada");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar a rota");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Editar rota ${rota?.codigo || ""}`} size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Data da rota" type="date" value={form.data} onChange={set("data")} />
        <Input label="Valor do motorista (R$)" type="number" step="0.01" min="0" value={form.valorMotorista} onChange={set("valorMotorista")} />
        <Select label="Motorista" value={form.motoristaId} onChange={set("motoristaId")}>
          <option value="">— Sem motorista —</option>
          {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </Select>
        <Select label="Veículo" value={form.veiculoId} onChange={set("veiculoId")}>
          <option value="">— Sem veículo —</option>
          {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.tipo}</option>)}
        </Select>
        <div className="sm:col-span-2">
          <Textarea label="Observações" value={form.observacoes} onChange={set("observacoes")} />
        </div>
        {opcoesVoltar.length > 0 && (
          <div className="sm:col-span-2 p-3 rounded-xl" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <Select label={`Voltar etapa (hoje: ${etapa ? STATUS_LABELS[etapa] : "—"})`} value={form.voltarPara} onChange={set("voltarPara")}>
              <option value="">— Manter a etapa —</option>
              {opcoesVoltar.map((e) => <option key={e} value={e}>Voltar para {STATUS_LABELS[e]}</option>)}
            </Select>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--text3)" }}>
              Volta só as entregas que estão à frente dessa etapa. Entrega já entregue ou em ocorrência não muda.
            </p>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button onClick={salvar} loading={salvando}>Salvar</Button>
      </div>
    </Modal>
  );
}
