"use client";
import { useEffect, useState } from "react";
import { Button, Input, Modal, Select, Textarea } from "@/components/ui";
import toast from "react-hot-toast";

const TIPOS = [
  ["AVARIA", "Avaria"], ["FALTA", "Falta"], ["INVERSAO", "Inversão"],
  ["SOBRA", "Sobra"], ["DEVOLUCAO", "Devolução"], ["SEM_PEDIDO", "Sem pedido"],
];
const FASES = [
  ["CONFERENCIA", "Conferência"], ["CARREGAMENTO", "Carregamento"],
  ["EM_ROTA", "Em rota"], ["ENTREGA", "Entrega"], ["DEVOLUCAO", "Devolução"],
];

// Datas vêm em UTC meia-noite: cortar a string evita deslocar um dia
const dia = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

function formDe(a: any) {
  return {
    tipo: a?.tipo || "AVARIA",
    fase: a?.fase || "CONFERENCIA",
    dataOcorrencia: dia(a?.dataOcorrencia),
    localOcorrencia: a?.localOcorrencia || "",
    descricao: a?.descricao || "",
    transportadoraChegada: a?.transportadoraChegada || "",
    motoristaChegada: a?.motoristaChegada || "",
    motoristaCpfChegada: a?.motoristaCpfChegada || "",
    placaChegada: a?.placaChegada || "",
    dataChegada: dia(a?.dataChegada),
    valorPrejuizo: a?.valorPrejuizo != null ? String(a.valorPrejuizo) : "0",
    observacoes: a?.observacoes || "",
  };
}

function Secao({ titulo }: { titulo: string }) {
  return (
    <div className="sm:col-span-2 text-[10px] font-mono uppercase tracking-widest pt-1" style={{ color: "var(--text3)" }}>
      {titulo}
    </div>
  );
}

export function EditarAvariaModal({ avaria, open, onClose, onSaved }: {
  avaria: any; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState(formDe(avaria));
  const [saving, setSaving] = useState(false);

  // Reinicia o formulário a cada abertura
  useEffect(() => { if (open) setForm(formDe(avaria)); }, [open, avaria]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const nulo = (v: string) => (v.trim() ? v.trim() : null);

  async function salvar() {
    setSaving(true);
    try {
      const body = {
        tipo: form.tipo,
        fase: form.fase,
        dataOcorrencia: form.dataOcorrencia || null,
        localOcorrencia: nulo(form.localOcorrencia),
        // descricao e obrigatoria no banco: vazia nao e enviada (fica a atual)
        descricao: form.descricao.trim() || undefined,
        transportadoraChegada: nulo(form.transportadoraChegada),
        motoristaChegada: nulo(form.motoristaChegada),
        motoristaCpfChegada: nulo(form.motoristaCpfChegada),
        placaChegada: nulo(form.placaChegada)?.toUpperCase() ?? null,
        dataChegada: form.dataChegada || null,
        valorPrejuizo: Number(form.valorPrejuizo) || 0,
        observacoes: nulo(form.observacoes),
      };
      const res = await fetch(`/api/avarias/${avaria.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Erro ao salvar");
      toast.success("Avaria atualizada");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar avaria" size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Secao titulo="Ocorrência" />
        <Select label="Tipo" value={form.tipo} onChange={set("tipo")}>
          {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select label="Fase" value={form.fase} onChange={set("fase")}>
          {FASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Input label="Data da ocorrência" type="date" value={form.dataOcorrencia} onChange={set("dataOcorrencia")} />
        <Input label="Local" value={form.localOcorrencia} onChange={set("localOcorrencia")} />
        <div className="sm:col-span-2">
          <Textarea label="Descrição" value={form.descricao} onChange={set("descricao")} />
        </div>

        <Secao titulo="Quem trouxe a mercadoria" />
        <Input label="Transportadora" value={form.transportadoraChegada} onChange={set("transportadoraChegada")} />
        <Input label="Motorista" value={form.motoristaChegada} onChange={set("motoristaChegada")} />
        <Input label="CPF do motorista" value={form.motoristaCpfChegada} onChange={set("motoristaCpfChegada")} />
        <Input label="Placa" value={form.placaChegada} onChange={e => setForm(f => ({ ...f, placaChegada: e.target.value.toUpperCase() }))} />
        <Input label="Data de chegada" type="date" value={form.dataChegada} onChange={set("dataChegada")} />

        <Secao titulo="Valores" />
        <div className="sm:col-span-2">
          <Input label="Valor do prejuízo (R$)" type="number" step="0.01" min="0" value={form.valorPrejuizo} onChange={set("valorPrejuizo")} />
          <p className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>
            Devolução sem produtos: soma das NFs de devolução — ajuste aqui se precisar.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Textarea label="Observações" value={form.observacoes} onChange={set("observacoes")} />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={salvar} loading={saving}>Salvar</Button>
      </div>
    </Modal>
  );
}
