"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Modal, Input, Textarea } from "@/components/ui";
import { RefreshCw, Undo2, HandHelping, Trash2 } from "lucide-react";
import { MOTIVOS_BAIXA } from "./deposito-ui";

// Espelha DepositoItem (prisma/schema.prisma) mais os campos calculados que a
// tela principal já resolveu antes de abrir o modal.
export type ItemDeposito = {
  id: string;
  codigo: string;
  descricao: string;
  notaNumero: string | null;
  embarcadorRazao: string;
  volumes: number;
  volumesBaixados: number;
  saldo: number;
  status: string;
  tipoEntrada: string;
  localizacao: string | null;
  dataEntrada: string | Date;
  diasParados: number;
  registradoPor: { name: string | null };
};

const ICONE_MOTIVO: Record<string, typeof RefreshCw> = {
  REEXPEDIDO: RefreshCw,
  DEVOLVIDO_EMBARCADOR: Undo2,
  RETIRADO_EMBARCADOR: HandHelping,
  DESCARTE: Trash2,
};

export function BaixaModal({ item, onClose, onBaixado }: {
  item: ItemDeposito | null;
  onClose: () => void;
  onBaixado: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [volumes, setVolumes] = useState("1");
  const [dataSaida, setDataSaida] = useState(new Date().toISOString().slice(0, 10));
  const [responsavel, setResponsavel] = useState("");
  const [documento, setDocumento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setMotivo("");
    setVolumes(String(item.saldo));
    setDataSaida(new Date().toISOString().slice(0, 10));
    setResponsavel("");
    setDocumento("");
    setObservacoes("");
  }, [item]);

  if (!item) return null;

  async function handleSalvar() {
    if (!item || !motivo) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/deposito/${item.id}/baixa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo, volumes: Number(volumes), responsavel, documento, dataSaida, observacoes }),
      });
      if (res.status === 409) {
        const d = await res.json();
        toast.error(d.error || "Conflito ao dar baixa");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro ao dar baixa");
      }
      toast.success("Baixa registrada");
      onBaixado();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao dar baixa");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={item !== null} onClose={onClose} title={`Dar baixa — ${item.codigo}`} size="md">
      <div className="space-y-4">
        {/* Picker 2x2 dos motivos de saída */}
        <div className="grid grid-cols-2 gap-3">
          {MOTIVOS_BAIXA.map((m) => {
            const Icone = ICONE_MOTIVO[m.value] || RefreshCw;
            const selecionado = motivo === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMotivo(m.value)}
                className="text-left p-3 rounded-xl transition-all"
                style={{
                  background: selecionado ? "rgba(249,115,22,.12)" : "var(--surface2)",
                  border: `1px solid ${selecionado ? "rgba(249,115,22,.32)" : "var(--border)"}`,
                }}
              >
                <Icone size={18} style={{ color: selecionado ? "#f97316" : "var(--text3)" }} />
                <div className="text-sm font-semibold mt-1.5">{m.label}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text3)" }}>{m.hint}</div>
              </button>
            );
          })}
        </div>

        {/* Resumo */}
        <div className="text-xs p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)" }}>
          <div><strong>{item.codigo}</strong> · NF {item.notaNumero || "—"} · {item.embarcadorRazao}</div>
          <div className="mt-1">Saldo em estoque: <strong>{item.saldo} de {item.volumes} volumes</strong></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Input
              label="Volumes a baixar"
              type="number"
              min={1}
              max={item.saldo}
              value={volumes}
              onChange={(e) => setVolumes(e.target.value)}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>
              Menos que o saldo registra baixa parcial; o item continua no depósito com o restante.
            </p>
          </div>
          <Input label="Data da saída" type="date" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} />
          <Input label="Responsável" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
          <Input
            label="Documento"
            placeholder="DS-00007, NF de retorno…"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
          />
          <div className="sm:col-span-2">
            <Textarea label="Observações" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
        </div>

        {motivo === "RETIRADO_EMBARCADOR" && (
          <p className="text-xs" style={{ color: "var(--text3)" }}>
            Precisa do documento assinado? Emita uma{" "}
            <a href="/avarias?tab=declaracao-saida" className="underline" style={{ color: "#f97316" }}>
              Declaração de Saída
            </a>.
          </p>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} disabled={!motivo} onClick={handleSalvar}>Dar baixa</Button>
        </div>
      </div>
    </Modal>
  );
}
