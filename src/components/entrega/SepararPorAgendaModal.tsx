"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Modal, Table, Th, Td, Tr, Loading } from "@/components/ui";
import { CalendarClock, AlertTriangle, Truck } from "lucide-react";
import { TIPO_LABEL } from "@/lib/veiculo-capacidades";
import type { GrupoAgenda } from "@/lib/agenda-nf";

type Fica = GrupoAgenda & { recebeAgenda: boolean };

type Resposta = {
  podeSeparar: boolean;
  motivo: string | null;
  fica: Fica;
  saem: GrupoAgenda[];
  agendaAtual: string | null;
};

interface Props {
  entregaId: string;
  open: boolean;
  onClose: () => void;
  onSeparado: () => void;
}

function formatarData(data: string | null): string {
  if (!data) return "sem agendamento — fica como está";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function SepararPorAgendaModal({ entregaId, open, onClose, onSeparado }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Resposta | null>(null);
  const [separando, setSeparando] = useState(false);

  const carregarPreview = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const r = await fetch(`/api/entregas/${entregaId}/separar-por-agenda`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao calcular separação");
      setData(d);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [entregaId]);

  useEffect(() => {
    if (open) carregarPreview();
  }, [open, carregarPreview]);

  async function confirmar() {
    setSeparando(true);
    try {
      const r = await fetch(`/api/entregas/${entregaId}/separar-por-agenda`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao separar entrega");
      toast.success(`Separado em ${d.novasEntregas.length + 1} entregas`);
      onSeparado();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao separar entrega");
    } finally {
      setSeparando(false);
    }
  }

  function linhaVeiculo(grupo: GrupoAgenda) {
    if (!grupo.veiculoSugerido) {
      return <span className="text-xs font-bold" style={{ color: "#ef4444" }}>nenhum veículo comporta</span>;
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <Truck size={12} /> {TIPO_LABEL[grupo.veiculoSugerido]}
      </span>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Separar por Agenda" size="lg">
      {loading && <Loading text="Calculando agrupamento..." />}

      {!loading && data && !data.podeSeparar && (
        <div className="space-y-4">
          <div className="rounded-xl p-3 flex items-start gap-2 text-sm" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
            <AlertTriangle size={16} style={{ color: "#f59e0b", marginTop: 2 }} />
            <span>{data.motivo}</span>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      )}

      {!loading && data && data.podeSeparar && (
        <div className="space-y-4">
          <p className="text-xs" style={{ color: "var(--text2)" }}>
            Agrupa pela data escrita em &quot;agendamento data:&quot; nos dados adicionais. Notas sem essa informação
            ficam nesta entrega, sem mudança. Agenda já existente nunca é substituída.
          </p>

          <Table>
            <thead>
              <tr>
                <Th>Agenda</Th>
                <Th>NFs</Th>
                <Th>m³</Th>
                <Th>Peso (kg)</Th>
                <Th>Veículo que cabe</Th>
              </tr>
            </thead>
            <tbody>
              <Tr>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <CalendarClock size={12} style={{ color: "var(--text3)" }} />
                    {formatarData(data.fica.data)}
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                    fica nesta entrega{data.fica.recebeAgenda ? " · recebe a agenda" : ""}
                  </span>
                </Td>
                <Td>{data.fica.notas.map((n) => n.numero).join(", ")}</Td>
                <Td className="font-mono">{data.fica.m3.toFixed(3)}</Td>
                <Td className="font-mono">{data.fica.pesoTotal.toFixed(1)}</Td>
                <Td>{linhaVeiculo(data.fica)}</Td>
              </Tr>
              {data.saem.map((grupo, i) => (
                <Tr key={i}>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <CalendarClock size={12} style={{ color: "var(--text3)" }} />
                      {formatarData(grupo.data)}
                    </div>
                  </Td>
                  <Td>{grupo.notas.map((n) => n.numero).join(", ")}</Td>
                  <Td className="font-mono">{grupo.m3.toFixed(3)}</Td>
                  <Td className="font-mono">{grupo.pesoTotal.toFixed(1)}</Td>
                  <Td>{linhaVeiculo(grupo)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={confirmar} loading={separando}>
              Separar em {data.saem.length + 1} entregas
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
