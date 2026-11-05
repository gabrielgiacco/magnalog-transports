"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui";

type Resumo = { id: string; status: "EM_ANDAMENTO" | "CONCLUIDA" | "COM_DIVERGENCIA"; avariaId: string | null } | null;

const SELO: Record<string, { texto: string; cor: string }> = {
  EM_ANDAMENTO: { texto: "Conferência em andamento", cor: "#f59e0b" },
  CONCLUIDA: { texto: "Conferida ✓", cor: "#10b981" },
  COM_DIVERGENCIA: { texto: "Conferida com divergência ⚠", cor: "#ef4444" },
};

/** Botão "Conferir carregamento" do detalhe da rota, com o selo da última conferência. */
export function ConferirCarregamento({ rotaId }: { rotaId: string }) {
  const router = useRouter();
  const [ultima, setUltima] = useState<Resumo>(null);

  useEffect(() => {
    fetch(`/api/conferencias?rotaId=${rotaId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUltima(d && d.id ? d : null))
      .catch(() => setUltima(null));
  }, [rotaId]);

  const selo = ultima ? SELO[ultima.status] : null;
  return (
    <>
      {selo && (
        <button onClick={() => router.push(`/conferencia/${ultima!.id}`)}
          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap"
          style={{ background: `${selo.cor}1f`, color: selo.cor, border: `1px solid ${selo.cor}55` }}>
          {selo.texto}
        </button>
      )}
      <Button variant="ghost" size="sm" onClick={() => router.push(`/conferencia?rota=${rotaId}`)}>
        <ScanBarcode size={14} /> Conferir carregamento
      </Button>
    </>
  );
}
