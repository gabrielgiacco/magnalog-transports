"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Modal, Input, Textarea } from "@/components/ui";
import { TIPOS_ENTRADA } from "./deposito-ui";

const HOJE = () => new Date().toISOString().slice(0, 10);

const BLANK_FORM = {
  tipoEntrada: "SOBRA",
  embarcadorRazao: "",
  embarcadorCnpj: "",
  descricao: "",
  volumes: "",
  pesoKg: "",
  valorMercadoria: "",
  notaNumero: "",
  notaSerie: "",
  transportadora: "",
  localizacao: "",
  dataEntrada: HOJE(),
  observacoes: "",
};

export function EntradaManualModal({ open, onClose, onSalvo }: {
  open: boolean;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [transportadoras, setTransportadoras] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/deposito/transportadoras")
      .then((r) => r.json())
      .then((data) => setTransportadoras(data.transportadoras || []))
      .catch(() => {});
  }, [open]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function resetForm() {
    setForm({ ...BLANK_FORM });
  }

  function fechar() {
    resetForm();
    onClose();
  }

  async function handleSalvar() {
    if (!form.tipoEntrada) {
      toast.error("Escolha o tipo de entrada");
      return;
    }
    if (!form.embarcadorRazao || !form.embarcadorCnpj) {
      toast.error("Informe a razão social e o CNPJ do embarcador");
      return;
    }
    if (!form.descricao) {
      toast.error("Descreva a mercadoria");
      return;
    }
    if (!form.volumes || Number(form.volumes) < 1) {
      toast.error("Informe pelo menos 1 volume");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/deposito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoEntrada: form.tipoEntrada,
          embarcadorRazao: form.embarcadorRazao,
          embarcadorCnpj: form.embarcadorCnpj.replace(/\D/g, ""),
          descricao: form.descricao,
          volumes: Number(form.volumes),
          pesoKg: form.pesoKg ? Number(form.pesoKg) : 0,
          valorMercadoria: form.valorMercadoria ? Number(form.valorMercadoria) : 0,
          notaNumero: form.notaNumero || null,
          notaSerie: form.notaSerie || null,
          transportadora: form.transportadora || null,
          localizacao: form.localizacao || null,
          dataEntrada: new Date(form.dataEntrada).toISOString(),
          observacoes: form.observacoes || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro ao registrar entrada");
      }
      toast.success("Item registrado no depósito");
      onSalvo();
      fechar();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar entrada");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={fechar} title="Nova entrada manual" size="lg">
      <div className="space-y-4">
        {/* Tipo de entrada — linha segmentada */}
        <div>
          <label className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>
            Tipo de entrada
          </label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {TIPOS_ENTRADA.map((t) => {
              const selecionado = form.tipoEntrada === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("tipoEntrada", t.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: selecionado ? `${t.cor}22` : "var(--surface2)",
                    border: `1px solid ${selecionado ? t.cor : "var(--border)"}`,
                    color: selecionado ? t.cor : "var(--text2)",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Embarcador (razão social)" value={form.embarcadorRazao} onChange={(e) => set("embarcadorRazao", e.target.value)} />
          <Input label="CNPJ do embarcador" value={form.embarcadorCnpj} onChange={(e) => set("embarcadorCnpj", e.target.value)} />
          <div className="sm:col-span-2 -mt-2">
            <p className="text-[11px]" style={{ color: "var(--text3)" }}>
              O embarcador é quem contratou o frete (o emitente da NF), não o destinatário.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Input
              label="Transportadora"
              list="dl-transp-entrada"
              value={form.transportadora}
              onChange={(e) => set("transportadora", e.target.value)}
            />
            <datalist id="dl-transp-entrada">
              {transportadoras.map((t) => <option key={t} value={t} />)}
            </datalist>
            <p className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>
              Quem trouxe a mercadoria de volta. Escolha da lista quando possível, para não criar outra grafia do mesmo nome.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Textarea label="Descrição" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </div>

          <Input label="Volumes" type="number" min={1} value={form.volumes} onChange={(e) => set("volumes", e.target.value)} />
          <Input label="Peso (kg)" type="number" value={form.pesoKg} onChange={(e) => set("pesoKg", e.target.value)} />
          <Input label="Valor da mercadoria (R$)" type="number" value={form.valorMercadoria} onChange={(e) => set("valorMercadoria", e.target.value)} />

          <Input label="NF — número" value={form.notaNumero} onChange={(e) => set("notaNumero", e.target.value)} />
          <Input label="NF — série" value={form.notaSerie} onChange={(e) => set("notaSerie", e.target.value)} />
          <div className="sm:col-span-2 -mt-2">
            <p className="text-[11px]" style={{ color: "var(--text3)" }}>
              Deixe em branco se a mercadoria não tem nota (sobra).
            </p>
          </div>

          <Input label="Localização" placeholder="Rua 3, box 12" value={form.localizacao} onChange={(e) => set("localizacao", e.target.value)} />
          <div>
            <Input label="Data de entrada" type="date" value={form.dataEntrada} onChange={(e) => set("dataEntrada", e.target.value)} />
            <p className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>
              Quando a mercadoria chegou ao depósito — pode ser retroativo.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Textarea label="Observações" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={fechar}>Cancelar</Button>
          <Button loading={saving} onClick={handleSalvar}>Registrar entrada</Button>
        </div>
      </div>
    </Modal>
  );
}
