"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Loading } from "@/components/ui";
import { LeitorCodigo } from "@/components/conferencia/LeitorCodigo";
import { ItemSheet } from "../ItemSheet";
import { ListaItens } from "../ListaItens";
import { ResultadoView } from "../ResultadoView";
import { QuantidadeModal } from "../QuantidadeModal";
import { chamar, itensDoCodigo, type Conferencia, type ItemConf, type Leitura } from "../tipos";

export default function ConferenciaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const base = `/api/conferencias/${id}`;
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [erro, setErro] = useState(false);
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [editando, setEditando] = useState<ItemConf | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [avaria, setAvaria] = useState<{ id: string; codigo?: string } | null>(null);
  // Leitura aguardando a quantidade no pop-up
  const [lido, setLido] = useState<{ codigo: string; itens: ItemConf[] } | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const seq = useRef(0);

  const carregar = useCallback(async () => {
    try {
      setConf(await chamar(base, "GET"));
    } catch (e: any) {
      toast.error(e.message);
      setErro(true);
    }
  }, [base]);

  useEffect(() => { carregar(); }, [carregar]);

  const trocarItem = (item: ItemConf) =>
    setConf((c) => {
      if (!c) return c;
      const existe = c.itens.some((i) => i.id === item.id);
      return { ...c, itens: existe ? c.itens.map((i) => (i.id === item.id ? { ...i, ...item } : i)) : [...c.itens, item] };
    });

  const avisar = (ok: boolean, texto: string) =>
    setLeituras((l) => [{ chave: ++seq.current, ok, texto }, ...l].slice(0, 3));

  // Bipou: abre o pop-up com o produto e pede a quantidade (nada e somado antes de confirmar)
  const ler = useCallback((codigo: string) => {
    if (lido) return; // ja ha um pop-up aberto
    const itens = conf ? itensDoCodigo(conf.itens, codigo) : [];
    navigator.vibrate?.(itens.length ? 80 : [80, 60, 80]);
    setLido({ codigo, itens });
  }, [conf, lido]);

  async function registrar(quantidade: number) {
    if (!lido) return;
    setRegistrando(true);
    try {
      const j = await chamar(base, "POST", { codigo: lido.codigo, quantidade });
      const atualizados: ItemConf[] = j.itens ?? [j.item];
      atualizados.forEach(trocarItem);
      const total = atualizados.reduce((s, i) => s + (i.qtdConferida || 0), 0)
        + lido.itens.filter((i) => !atualizados.some((a) => a.id === i.id)).reduce((s, i) => s + (i.qtdConferida || 0), 0);
      if (j.foraDaCarga) avisar(false, `Fora da carga: ${lido.codigo} · ${quantidade} registrada(s)`);
      else avisar(true, `+${quantidade} · ${j.item.descricao} — contadas: ${total}`);
      setLido(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao registrar");
    } finally {
      setRegistrando(false);
    }
  }

  async function salvar(dados: { qtdConferida: number; qtdAvaria: number; observacao: string }) {
    if (!editando) return;
    setSalvando(true);
    try {
      const j = await chamar(base, "PATCH", { itemId: editando.id, ...dados });
      trocarItem(j.item ?? j);
      setEditando(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function remover(item: ItemConf) {
    try {
      await chamar(`${base}?itemId=${item.id}`, "DELETE");
      setConf((c) => (c ? { ...c, itens: c.itens.filter((i) => i.id !== item.id) } : c));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function finalizar() {
    setFinalizando(true);
    try {
      await fila.current;
      const j = await chamar(`${base}/finalizar`, "POST");
      if (j.avaria) setAvaria(j.avaria);
      setConfirmando(false);
      await carregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setFinalizando(false);
    }
  }

  if (erro) return <><Topbar title="Conferência" /><div className="p-6 text-center" style={{ color: "var(--text2)" }}>Conferência não encontrada.</div></>;
  if (!conf) return <><Topbar title="Conferência" /><Loading /></>;

  const subtitulo = `${conf.rota.motorista || "Sem motorista"} · ${conf.rota.placa || "sem placa"}`;
  const emAndamento = conf.status === "EM_ANDAMENTO";

  return (
    <>
      <Topbar title={`Conferência ${conf.rota.codigo}`} subtitle={subtitulo} />
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        {emAndamento ? (
          <>
            <div className="sticky top-0 z-20 -mx-4 px-4 py-2 md:mx-0 md:px-0" style={{ background: "var(--bg, var(--surface))" }}>
              <LeitorCodigo onLer={ler} pausado={!!editando || confirmando || !!lido} />
            </div>
            {leituras.length > 0 && (
              <div className="space-y-1.5">
                {leituras.map((l, i) => (
                  <div key={l.chave} className={`text-sm font-semibold rounded-lg px-3 py-2 ${i > 0 ? "opacity-60" : ""}`}
                    style={{
                      background: l.ok ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                      color: l.ok ? "#34d399" : "#f87171",
                    }}>
                    {l.texto}
                  </div>
                ))}
              </div>
            )}
            <ListaItens conf={conf} onAbrir={setEditando} onRemover={remover} />
            <div className="sticky bottom-0 -mx-4 px-4 py-3 md:mx-0 md:px-0" style={{ background: "var(--bg, var(--surface))" }}>
              {confirmando ? (
                <div className="rounded-lg p-3 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                    Finalizar conferência? Depois de finalizar não dá para continuar contando.
                  </p>
                  <div className="flex gap-2">
                    <Button size="lg" variant="ghost" className="flex-1 h-12" onClick={() => setConfirmando(false)}>Voltar</Button>
                    <Button size="lg" className="flex-1 h-12" loading={finalizando} onClick={finalizar}>Finalizar</Button>
                  </div>
                </div>
              ) : (
                <Button size="lg" className="w-full h-12" onClick={() => setConfirmando(true)}>Finalizar conferência</Button>
              )}
            </div>
          </>
        ) : (
          <ResultadoView conf={conf} avaria={avaria} />
        )}
      </div>
      {lido && (
        <QuantidadeModal codigo={lido.codigo} itens={lido.itens} salvando={registrando}
          onConfirmar={registrar} onCancelar={() => setLido(null)} />
      )}
      {editando && (
        <ItemSheet item={editando} salvando={salvando} onFechar={() => setEditando(null)} onSalvar={salvar} />
      )}
    </>
  );
}
