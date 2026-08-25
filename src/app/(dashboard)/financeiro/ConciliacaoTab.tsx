"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Empty, Loading, Modal } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Upload, Loader2, CheckCircle2, AlertTriangle, EyeOff, Plus, Landmark, X } from "lucide-react";

interface Sugestao {
  lancamentoId: string;
  descricao: string;
  valor: number;
  favorecido: string | null;
  dataVencimento: string;
  pontos: number;
  motivo: string;
}

interface Transacao {
  id: string;
  data: string;
  valor: number;
  descricao: string;
  origem: string;
  conta: { id: string; nome: string };
  confiavel: boolean;
  sugestoes: Sugestao[];
}

interface Conta {
  id: string;
  nome: string;
  banco: string | null;
  identificadorOfx: string | null;
  _count?: { transacoes: number };
}

type Decisao =
  | { acao: "casar"; lancamentoId: string }
  | { acao: "criar"; foraDoDre: boolean }
  | { acao: "ignorar" };

export function ConciliacaoTab() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [importando, setImportando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({});
  const [showConta, setShowConta] = useState(false);
  const [novaConta, setNovaConta] = useState({ nome: "", banco: "", identificadorOfx: "" });
  const [arquivoPendente, setArquivoPendente] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [rc, rt] = await Promise.all([
        fetch("/api/contas-bancarias"),
        fetch("/api/conciliacao"),
      ]);
      if (rc.ok) setContas((await rc.json()).contas || []);
      if (rt.ok) {
        const d = await rt.json();
        setTransacoes(d.transacoes || []);
        setResumo(d.resumo || null);
        // Pré-seleciona só o que o motor considera confiável. O resto exige
        // olhar — é justamente onde há dois pagamentos iguais no mesmo dia.
        const iniciais: Record<string, Decisao> = {};
        for (const t of d.transacoes || []) {
          if (t.confiavel && t.sugestoes[0]) {
            iniciais[t.id] = { acao: "casar", lancamentoId: t.sugestoes[0].lancamentoId };
          }
        }
        setDecisoes(iniciais);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function enviar(file: File, contaId?: string) {
    setImportando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (contaId) fd.append("contaId", contaId);

      const r = await fetch("/api/conciliacao/importar", { method: "POST", body: fd });
      const d = await r.json();

      if (r.status === 409 && d.precisaEscolherConta) {
        // Primeiro arquivo desta conta: pede para escolher e memoriza o ACCTID.
        setArquivoPendente(file);
        setNovaConta((n) => ({ ...n, identificadorOfx: d.identificadorOfx || "" }));
        toast("Escolha a conta deste extrato", { icon: "🏦" });
        setShowConta(true);
        return;
      }
      if (!r.ok) throw new Error(d.error || "Erro ao importar");

      const onde = d.conta ? d.conta.nome : `${d.contasCriadas?.length ? d.contasCriadas.length + " conta(s) criada(s) · " : ""}${d.origem === "MINHAS_FINANCAS" ? "Minhas Finanças" : "OFX"}`;
      toast.success(`${d.novas} nova(s) · ${d.duplicadas} já existia(m) — ${onde}`);
      setArquivoPendente(null);
      carregar();
    } catch (e: any) {
      toast.error(e.message || "Erro ao importar");
    } finally { setImportando(false); }
  }

  async function criarConta() {
    if (!novaConta.nome.trim()) { toast.error("Informe o nome da conta"); return; }
    try {
      const r = await fetch("/api/contas-bancarias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novaConta),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro");
      toast.success("Conta cadastrada");
      setShowConta(false);
      setNovaConta({ nome: "", banco: "", identificadorOfx: "" });
      if (arquivoPendente) await enviar(arquivoPendente, d.id);
      else carregar();
    } catch (e: any) { toast.error(e.message); }
  }

  async function aplicar() {
    const acoes = Object.entries(decisoes).map(([transacaoId, d]) => ({ transacaoId, ...d }));
    if (acoes.length === 0) { toast.error("Nenhuma decisão marcada"); return; }
    setAplicando(true);
    try {
      const r = await fetch("/api/conciliacao/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acoes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro");
      const partes = [];
      if (d.conciliadas) partes.push(`${d.conciliadas} conciliada(s)`);
      if (d.criadas) partes.push(`${d.criadas} lançamento(s) criado(s)`);
      if (d.ignoradas) partes.push(`${d.ignoradas} ignorada(s)`);
      toast.success(partes.join(" · ") || "Nada aplicado");
      if (d.erros?.length) for (const e of d.erros.slice(0, 3)) toast.error(e);
      setDecisoes({});
      carregar();
    } catch (e: any) { toast.error(e.message); }
    finally { setAplicando(false); }
  }

  const marcar = (id: string, d: Decisao | null) =>
    setDecisoes((prev) => {
      const n = { ...prev };
      if (d === null) delete n[id]; else n[id] = d;
      return n;
    });

  const totalDecidido = Object.keys(decisoes).length;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-start gap-3">
            <Landmark size={20} className="text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold">Conciliação bancária</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text2)" }}>
                Importe o extrato em OFX do banco ou o CSV exportado do Minhas Finanças. O sistema
                sugere qual lançamento cada movimento paga, mostrando o motivo. Nada é conciliado
                sem a sua confirmação.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setArquivoPendente(null); setShowConta(true); }}>
              <Plus size={13} /> Conta
            </Button>
            <Button onClick={() => inputRef.current?.click()} disabled={importando}>
              {importando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Importar extrato
            </Button>
            <input ref={inputRef} type="file" accept=".ofx,.OFX,.csv,.CSV,text/plain,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ""; }} />
          </div>
        </div>

        {contas.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            {contas.map((c) => (
              <span key={c.id} className="text-[10px] px-2 py-1 rounded-lg font-mono"
                style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                {c.nome}{c._count ? ` · ${c._count.transacoes}` : ""}
                {!c.identificadorOfx && <span className="ml-1 text-amber-500">sem OFX</span>}
              </span>
            ))}
          </div>
        )}
      </Card>

      {resumo && resumo.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ["Pendentes", resumo.total, "var(--text)"],
            ["Com sugestão", resumo.comSugestao, "#3b82f6"],
            ["Confiáveis", resumo.confiaveis, "#10b981"],
            ["Sem correspondência", resumo.semSugestao, "#f59e0b"],
          ].map(([label, v, cor]) => (
            <Card key={label as string} className="p-3">
              <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text3)" }}>{label}</div>
              <div className="text-xl font-mono font-bold" style={{ color: cor as string }}>{v as number}</div>
            </Card>
          ))}
        </div>
      )}

      {loading ? <Loading /> : transacoes.length === 0 ? (
        <Empty icon="🏦" text="Nenhuma transação pendente. Importe um extrato para começar." />
      ) : (
        <>
          <div className="space-y-2">
            {transacoes.map((t) => {
              const d = decisoes[t.id];
              const saida = t.valor < 0;
              return (
                <Card key={t.id} className="p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>{formatDate(t.data)}</span>
                        <span className={`text-sm font-mono font-bold ${saida ? "text-rose-500" : "text-emerald-600"}`}>
                          {formatCurrency(t.valor)}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: "var(--surface2)", color: "var(--text3)" }}>
                          {t.conta.nome}
                        </span>
                        {t.confiavel && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1"
                            style={{ background: "rgba(16,185,129,.15)", color: "#10b981" }}>
                            <CheckCircle2 size={9} /> confiável
                          </span>
                        )}
                        {!t.confiavel && t.sugestoes.length > 0 && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1"
                            style={{ background: "rgba(245,158,11,.15)", color: "#d97706" }}>
                            <AlertTriangle size={9} /> confira
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--text)" }}>{t.descricao}</div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button onClick={() => marcar(t.id, d?.acao === "criar" ? null : { acao: "criar", foraDoDre: false })}
                        className="text-[11px] px-2 py-1 rounded-lg"
                        style={{ background: d?.acao === "criar" ? "rgba(59,130,246,.15)" : "var(--surface2)", color: d?.acao === "criar" ? "#3b82f6" : "var(--text3)" }}>
                        <Plus size={11} className="inline mr-1" />Criar lançamento
                      </button>
                      <button onClick={() => marcar(t.id, d?.acao === "ignorar" ? null : { acao: "ignorar" })}
                        className="text-[11px] px-2 py-1 rounded-lg"
                        style={{ background: d?.acao === "ignorar" ? "rgba(239,68,68,.12)" : "var(--surface2)", color: d?.acao === "ignorar" ? "#ef4444" : "var(--text3)" }}>
                        <EyeOff size={11} className="inline mr-1" />Ignorar
                      </button>
                    </div>
                  </div>

                  {d?.acao === "criar" && (
                    <label className="flex items-center gap-2 mt-2 text-[11px] cursor-pointer" style={{ color: "var(--text2)" }}>
                      <input type="checkbox" checked={d.foraDoDre} className="accent-orange-500"
                        onChange={(e) => marcar(t.id, { acao: "criar", foraDoDre: e.target.checked })} />
                      Ignorar nos totais do DRE (mantém no caixa)
                    </label>
                  )}

                  {t.sugestoes.length > 0 && d?.acao !== "criar" && d?.acao !== "ignorar" && (
                    <div className="mt-2 space-y-1">
                      {t.sugestoes.map((s) => {
                        const escolhida = d?.acao === "casar" && d.lancamentoId === s.lancamentoId;
                        return (
                          <button key={s.lancamentoId}
                            onClick={() => marcar(t.id, escolhida ? null : { acao: "casar", lancamentoId: s.lancamentoId })}
                            className="w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2 transition-colors"
                            style={{
                              background: escolhida ? "rgba(16,185,129,.10)" : "var(--surface2)",
                              border: `1px solid ${escolhida ? "rgba(16,185,129,.4)" : "var(--border)"}`,
                            }}>
                            <input type="checkbox" readOnly checked={escolhida} className="accent-emerald-500" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs truncate" style={{ color: "var(--text)" }}>{s.descricao}</div>
                              <div className="text-[10px]" style={{ color: "var(--text3)" }}>
                                {s.favorecido || "sem favorecido"} · vence {formatDate(s.dataVencimento)} · <b>{s.motivo}</b>
                              </div>
                            </div>
                            <span className="text-xs font-mono" style={{ color: "var(--text2)" }}>{formatCurrency(s.valor)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {t.sugestoes.length === 0 && (
                    <div className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>
                      Sem lançamento correspondente no TMS.
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <div className="sticky bottom-0 py-3 flex items-center justify-between gap-3 flex-wrap"
            style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
            <span className="text-xs" style={{ color: "var(--text2)" }}>
              <b>{totalDecidido}</b> de {transacoes.length} com decisão marcada
            </span>
            <Button onClick={aplicar} loading={aplicando} disabled={totalDecidido === 0}>
              <CheckCircle2 size={14} /> Aplicar {totalDecidido > 0 ? `(${totalDecidido})` : ""}
            </Button>
          </div>
        </>
      )}

      <Modal open={showConta} onClose={() => { setShowConta(false); setArquivoPendente(null); }} title="Conta bancária" size="sm">
        <div className="space-y-3">
          {arquivoPendente && (
            <div className="p-3 rounded-xl text-xs" style={{ background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.2)", color: "var(--text2)" }}>
              O extrato traz a conta <b>{novaConta.identificadorOfx || "sem identificador"}</b>, que ainda não está
              cadastrada. Cadastre e o import continua sozinho — nos próximos arquivos ela é reconhecida automaticamente.
            </div>
          )}
          {[
            ["nome", "Nome *", "Sicredi Empresas"],
            ["banco", "Banco", "Sicredi"],
            ["identificadorOfx", "Identificador OFX", "número da conta no arquivo"],
          ].map(([campo, label, ph]) => (
            <div key={campo}>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: "var(--text3)" }}>{label}</label>
              <input
                value={(novaConta as any)[campo]}
                onChange={(e) => setNovaConta((n) => ({ ...n, [campo]: e.target.value }))}
                placeholder={ph}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => { setShowConta(false); setArquivoPendente(null); }}>
            <X size={13} /> Cancelar
          </Button>
          <Button onClick={criarConta}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
