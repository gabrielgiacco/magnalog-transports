"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, Empty } from "@/components/ui";

interface RotaConf {
  id: string;
  codigo: string;
  motorista?: string | null;
  placa?: string | null;
  entregas: number;
  nfs: number;
  conferencia: { id: string; status: string; avariaId?: string | null } | null;
}

function hojeLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function Chip({ conf }: { conf: RotaConf["conferencia"] }) {
  let txt = "Não conferida";
  let cor = "#9ca3af";
  if (conf?.status === "EM_ANDAMENTO") { txt = "Em andamento"; cor = "#f59e0b"; }
  else if (conf?.status === "CONCLUIDA") { txt = "Conferida ✓"; cor = "#10b981"; }
  else if (conf?.status === "COM_DIVERGENCIA") { txt = "Com divergência ⚠"; cor = "#ef4444"; }
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ color: cor, background: `${cor}1f`, border: `1px solid ${cor}55` }}>
      {txt}
    </span>
  );
}

function ConferenciaRotas() {
  const router = useRouter();
  const params = useSearchParams();
  const rotaParam = params.get("rota");
  const [data, setData] = useState(hojeLocal());
  const [rotas, setRotas] = useState<RotaConf[]>([]);
  const [loading, setLoading] = useState(true);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/conferencias?data=${data}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar rotas");
      setRotas(Array.isArray(j) ? j : []);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar rotas");
      setRotas([]);
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => { if (!rotaParam) carregar(); }, [carregar, rotaParam]);

  const criar = useCallback(async (rotaId: string) => {
    const r = await fetch("/api/conferencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotaId }),
    });
    const j = await r.json();
    if (!r.ok || !j.id) throw new Error(j.error || "Não foi possível abrir a conferência");
    router.push(`/conferencia/${j.id}`);
  }, [router]);

  const abrir = useCallback(async (rotaId: string) => {
    setAbrindo(rotaId);
    try {
      await criar(rotaId);
    } catch (e: any) {
      toast.error(e.message);
      setAbrindo(null);
    }
  }, [criar]);

  // ?rota=<id>: abre direto
  useEffect(() => {
    if (rotaParam) criar(rotaParam).catch((e) => { toast.error(e.message); router.replace("/conferencia"); });
  }, [rotaParam, criar, router]);

  if (rotaParam) return <Loading text="Abrindo conferência..." />;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <input
        type="date"
        value={data}
        onChange={(e) => e.target.value && setData(e.target.value)}
        className="h-12 w-full sm:w-56 px-3 rounded-lg text-base outline-none"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
      />
      {loading ? <Loading /> : rotas.length === 0 ? <Empty text="Nenhuma rota nessa data." /> : (
        <div className="space-y-3">
          {rotas.map((r) => {
            const conf = r.conferencia;
            const concluida = conf && conf.status !== "EM_ANDAMENTO";
            return (
              <Card key={r.id} className="p-4 space-y-3">
                <button type="button" className="w-full text-left space-y-1" disabled={!!abrindo}
                  onClick={() => (concluida ? router.push(`/conferencia/${conf.id}`) : abrir(r.id))}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-lg" style={{ color: "var(--text)" }}>{r.codigo}</span>
                    <Chip conf={conf} />
                  </div>
                  <div className="text-sm" style={{ color: "var(--text2)" }}>
                    {r.motorista || "Sem motorista"} · {r.placa || "sem placa"}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text2)" }}>
                    {r.entregas} entregas · {r.nfs} NFs
                  </div>
                </button>
                {concluida && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="lg" onClick={() => router.push(`/conferencia/${conf.id}`)}>Ver resultado</Button>
                    <Button size="lg" variant="ghost" loading={abrindo === r.id} onClick={() => abrir(r.id)}>Conferir de novo</Button>
                    {conf.status === "COM_DIVERGENCIA" && conf.avariaId && (
                      <Link href={`/avarias/${conf.avariaId}`} className="text-sm font-semibold text-red-400 underline">Ver avaria</Link>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ConferenciaPage() {
  return (
    <>
      <Topbar title="Conferência de carregamento" />
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<Loading />}>
          <ConferenciaRotas />
        </Suspense>
      </div>
    </>
  );
}
