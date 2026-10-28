"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Modal } from "@/components/ui";
import { proximaEtapa } from "@/lib/rota-etapa";
import { STATUS_LABELS } from "@/lib/utils";

const ICONE: Record<string, string> = { EM_SEPARACAO: "📦", CARREGADO: "🔄", EM_ROTA: "🚛", ENTREGUE: "✅", FINALIZADO: "🏁" };

/**
 * Botão que leva a rota para a próxima etapa do fluxo da entrega direta. A data
 * de entrega só é pedida quando o servidor responde que alguma entrega ainda
 * não tem data — no Finalizado, depois do Entregue, todas já têm e não pergunta.
 */
export function AvancarEtapaRota({ rotaId, etapa, onAvancou }: { rotaId: string; etapa: string | null; onAvancou: (etapa: string) => void }) {
  const proxima = proximaEtapa(etapa);
  const [pedindoData, setPedindoData] = useState(false);
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [salvando, setSalvando] = useState(false);
  if (!proxima) return null;

  async function avancar(dataEntrega?: string) {
    if (!proxima) return;
    setSalvando(true);
    try {
      const res = await fetch(`/api/rotas/${rotaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: proxima, ...(dataEntrega ? { dataEntrega: new Date(dataEntrega + "T12:00:00").toISOString() } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Alguma entrega ainda sem data: aí sim pergunta a data
        if (!dataEntrega && err.error === "DATA_ENTREGA_OBRIGATORIA") {
          setPedindoData(true);
          return;
        }
        throw new Error(err.message || err.error || "Erro ao avançar a rota");
      }
      setPedindoData(false);
      toast.success(`Rota em ${STATUS_LABELS[proxima]}`);
      onAvancou(proxima);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao avançar a rota");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => avancar()} loading={salvando}>
        {ICONE[proxima]} {STATUS_LABELS[proxima]}
      </Button>
      <Modal open={pedindoData} onClose={() => setPedindoData(false)} title="Data da entrega" size="sm">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            Vale para as entregas da rota que ainda não têm data de entrega.
          </p>
          <Input label="Data da entrega" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setPedindoData(false)}>Cancelar</Button>
            <Button onClick={() => avancar(data)} loading={salvando} disabled={!data}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
