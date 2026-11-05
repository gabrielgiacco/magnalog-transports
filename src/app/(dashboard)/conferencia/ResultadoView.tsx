"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { Conferencia, ItemConf } from "./tipos";

function Chip({ rotulo, n, cor }: { rotulo: string; n: number; cor: string }) {
  return (
    <div className="flex-1 min-w-[5.5rem] rounded-lg p-3 text-center" style={{ background: `${cor}1a`, border: `1px solid ${cor}55` }}>
      <div className="text-2xl font-bold" style={{ color: cor }}>{n}</div>
      <div className="text-xs font-semibold" style={{ color: cor }}>{rotulo}</div>
    </div>
  );
}

function Situacao({ item }: { item: ItemConf }) {
  const r = item.resultado;
  const partes: { txt: string; cor: string }[] = [];
  if (item.foraDaCarga || r?.situacao === "FORA_DA_CARGA") partes.push({ txt: "fora da carga", cor: "#ef4444" });
  else if (r?.situacao === "FALTA") partes.push({ txt: `faltam ${r.falta ?? 0}`, cor: "#ef4444" });
  else if (r?.situacao === "SOBRA") partes.push({ txt: `sobram ${r.sobra ?? 0}`, cor: "#f59e0b" });
  else partes.push({ txt: "OK", cor: "#10b981" });
  const av = r?.avaria ?? item.qtdAvaria;
  if (av > 0) partes.push({ txt: `${av} avariadas`, cor: "#f97316" });
  return (
    <div className="text-right shrink-0">
      {partes.map((p) => <div key={p.txt} className="text-sm font-bold" style={{ color: p.cor }}>{p.txt}</div>)}
    </div>
  );
}

interface Props {
  conf: Conferencia;
  avaria: { id: string; codigo?: string } | null;
}

export function ResultadoView({ conf, avaria }: Props) {
  const router = useRouter();
  const itens = conf.itens;
  const sit = (i: ItemConf) => i.resultado?.situacao;
  const ok = itens.filter((i) => !i.foraDaCarga && sit(i) === "OK").length;
  const falta = itens.filter((i) => sit(i) === "FALTA").length;
  const sobra = itens.filter((i) => sit(i) === "SOBRA").length;
  const comAvaria = itens.filter((i) => (i.resultado?.avaria ?? i.qtdAvaria) > 0).length;
  const fora = itens.filter((i) => i.foraDaCarga).length;
  const avariaId = avaria?.id || conf.avariaId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip rotulo="OK" n={ok} cor="#10b981" />
        <Chip rotulo="Falta" n={falta} cor="#ef4444" />
        <Chip rotulo="Sobra" n={sobra} cor="#f59e0b" />
        <Chip rotulo="Avaria" n={comAvaria} cor="#f97316" />
        <Chip rotulo="Fora da carga" n={fora} cor="#ef4444" />
      </div>
      {avariaId && (
        <Link href={`/avarias/${avariaId}`}
          className="block rounded-lg p-4 text-center font-bold text-white bg-red-500 active:scale-95">
          Avaria {avaria?.codigo || ""} criada — abrir
        </Link>
      )}
      <div className="space-y-2">
        {itens.map((it) => (
          <div key={it.id} className="flex items-start justify-between gap-3 p-3 rounded-lg"
            style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <div className="min-w-0">
              <div className="font-semibold text-sm leading-snug" style={{ color: "var(--text)" }}>{it.descricao}</div>
              <div className="text-xs" style={{ color: "var(--text2)" }}>NF {it.nfNumero ?? "—"}</div>
              <div className="text-xs" style={{ color: "var(--text2)" }}>
                esperado {it.qtdEsperada ?? 0} · contado {it.qtdConferida}
              </div>
            </div>
            <Situacao item={it} />
          </div>
        ))}
      </div>
      <Button size="lg" variant="ghost" className="w-full h-12" onClick={() => router.push("/conferencia")}>
        Voltar às rotas
      </Button>
    </div>
  );
}
