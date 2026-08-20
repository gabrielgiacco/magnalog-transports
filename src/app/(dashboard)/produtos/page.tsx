"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Empty, Table, Th, Td, Tr } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Search, Boxes, Copy, Loader2, Database, ShoppingCart, Trash2, FileText, Printer, X } from "lucide-react";

type Resultado = {
  id: string;
  codigo: string;
  descricao: string;
  fornecedorCnpj: string;
  fornecedorNome: string | null;
  ncm: string | null;
  unidade: string | null;
  contagemUso: number;
  ultimaOcorrencia: string;
  valorUnitario: number | null;
  valorUnitarioEm: string | null;
  score: number;
  tokensMatch: string[];
};

type ItemCarrinho = { produto: Resultado; quantidade: number };

function highlight(texto: string, tokens: string[]) {
  if (tokens.length === 0) return texto;
  let out = texto;
  // Insensitive match usando regex por token
  const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
  const escaped = sortedTokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const rx = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = out.split(rx);
  return parts.map((p, i) =>
    rx.test(p) ? (
      <mark key={i} style={{ background: "rgba(249,115,22,.3)", color: "inherit", padding: "0 2px", borderRadius: 2 }}>
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export default function ProdutosPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  const [aba, setAba] = useState<"catalogo" | "orcamentos">("catalogo");

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [backfilling, setBackfilling] = useState(false);
  const debounceRef = useRef<any>(null);

  // O carrinho vive fora dos resultados de propósito: a busca é por query,
  // então procurar o segundo produto apagaria a lista onde está o primeiro.
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [gerando, setGerando] = useState(false);

  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [loadingOrc, setLoadingOrc] = useState(false);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    if (!debounced || debounced.length < 2) { setResultados([]); return; }
    setLoading(true);
    fetch(`/api/produtos/buscar?q=${encodeURIComponent(debounced)}&limite=50`)
      .then((r) => r.json())
      .then((d) => setResultados(d.resultados || []))
      .catch(() => toast.error("Erro na busca"))
      .finally(() => setLoading(false));
  }, [debounced]);

  const fetchOrcamentos = useCallback(async () => {
    setLoadingOrc(true);
    try {
      const r = await fetch("/api/orcamentos");
      if (r.ok) setOrcamentos((await r.json()).orcamentos || []);
    } finally { setLoadingOrc(false); }
  }, []);

  useEffect(() => { if (aba === "orcamentos") fetchOrcamentos(); }, [aba, fetchOrcamentos]);

  async function runBackfill() {
    if (!confirm("Reprocessar o histórico de NFs para atualizar o catálogo de produtos? Pode demorar alguns segundos.")) return;
    setBackfilling(true);
    try {
      const r = await fetch("/api/produtos/backfill", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro");
      toast.success(`${d.produtosIndexados} produto(s) indexado(s) de ${d.notasProcessadas} NF(s). Total no catálogo: ${d.totalNoBanco}.`);
      if (debounced) {
        // recarrega busca atual
        setDebounced(debounced + " ");
        setTimeout(() => setDebounced(debounced), 50);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBackfilling(false);
    }
  }

  const noCarrinho = (id: string) => carrinho.some((c) => c.produto.id === id);

  function alternar(p: Resultado) {
    setCarrinho((prev) =>
      prev.some((c) => c.produto.id === p.id)
        ? prev.filter((c) => c.produto.id !== p.id)
        : [...prev, { produto: p, quantidade: 1 }]
    );
  }

  function mudarQtd(id: string, valor: string) {
    const n = parseFloat(valor.replace(",", "."));
    setCarrinho((prev) =>
      prev.map((c) => (c.produto.id === id ? { ...c, quantidade: isFinite(n) && n > 0 ? n : 0 } : c))
    );
  }

  const totalCarrinho = carrinho.reduce((s, c) => s + (c.produto.valorUnitario || 0) * c.quantidade, 0);

  async function gerarOrcamento() {
    if (carrinho.some((c) => !c.quantidade || c.quantidade <= 0)) {
      toast.error("Há itens com quantidade zerada");
      return;
    }
    setGerando(true);
    try {
      const r = await fetch("/api/orcamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observacoes,
          itens: carrinho.map((c) => ({ produtoCatalogoId: c.produto.id, quantidade: c.quantidade })),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao gerar");
      const criado = await r.json();
      toast.success(`Orçamento ${criado.codigo} gerado!`);
      window.open(`/imprimir/orcamento/${criado.id}`, "_blank");
      setCarrinho([]);
      setObservacoes("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar orçamento");
    } finally {
      setGerando(false);
    }
  }

  if (user?.role !== "ADMIN") {
    return (
      <>
        <Topbar title="Catálogo de Produtos" />
        <div className="p-8 text-center" style={{ color: "var(--text3)" }}>Apenas administradores podem acessar esta página.</div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Catálogo de Produtos"
        subtitle="Busca fuzzy nos produtos indexados das NFs importadas"
        actions={
          <Button variant="ghost" size="sm" onClick={runBackfill} disabled={backfilling}>
            {backfilling ? <><Loader2 size={13} className="animate-spin" /> Reprocessando...</> : <><Database size={13} /> Reprocessar Histórico</>}
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Abas */}
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            {([
              { key: "catalogo", label: "Catálogo", icon: Boxes },
              { key: "orcamentos", label: "Orçamentos", icon: FileText },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setAba(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${aba === t.key ? "bg-orange-500/10 text-orange-500 shadow-sm" : "text-[var(--text2)] hover:bg-[var(--surface)]"}`}
              >
                <t.icon size={14} /> {t.label}
                {t.key === "catalogo" && carrinho.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "white" }}>
                    {carrinho.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {aba === "catalogo" ? (
            <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-4 lg:items-start space-y-4 lg:space-y-0">
              {/* Busca + resultados */}
              <div className="space-y-4">
                <Card>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
                    <input
                      type="text"
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Ex: fralda calca xg52 · mpoko · 12345 · ..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-3 text-[11px]" style={{ color: "var(--text3)" }}>
                    <span>
                      Digite ao menos 2 caracteres. Marque os produtos para montar o orçamento — a seleção não se perde ao buscar outro item.
                    </span>
                    {debounced && !loading && <span className="font-mono">{resultados.length} resultado(s)</span>}
                  </div>
                </Card>

                {loading && <div className="text-center py-8"><Loader2 size={20} className="animate-spin inline-block text-orange-500" /></div>}

                {!loading && debounced && resultados.length === 0 && (
                  <Empty icon="📦" text="Nenhum produto encontrado. Se ainda não indexou, clique em 'Reprocessar Histórico' no topo." />
                )}

                {!loading && resultados.length > 0 && (
                  <Card className="p-0 overflow-hidden">
                    <Table>
                      <thead>
                        <tr>
                          <Th></Th>
                          <Th>Código</Th>
                          <Th>Descrição</Th>
                          <Th>Fornecedor</Th>
                          <Th className="text-right">Valor Un.</Th>
                          <Th className="text-right">Uso</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultados.map((r) => (
                          <Tr key={r.id}>
                            <Td>
                              <input
                                type="checkbox"
                                checked={noCarrinho(r.id)}
                                onChange={() => alternar(r)}
                                className="accent-orange-500 cursor-pointer"
                                title="Adicionar ao orçamento"
                              />
                            </Td>
                            <Td>
                              <button
                                className="text-xs font-mono font-bold hover:text-orange-500 transition-colors inline-flex items-center gap-1"
                                onClick={() => { navigator.clipboard.writeText(r.codigo); toast.success("Código copiado"); }}
                                title="Clique para copiar"
                              >
                                {r.codigo} <Copy size={10} className="opacity-50" />
                              </button>
                            </Td>
                            <Td>
                              <div className="text-xs" style={{ color: "var(--text)" }}>{highlight(r.descricao, r.tokensMatch)}</div>
                              {r.unidade && <div className="text-[10px] mt-0.5" style={{ color: "var(--text3)" }}>Un: {r.unidade}</div>}
                            </Td>
                            <Td>
                              <div className="text-xs" style={{ color: "var(--text2)" }}>{r.fornecedorNome || "—"}</div>
                              <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text3)" }}>{r.fornecedorCnpj}</div>
                            </Td>
                            <Td className="text-right">
                              {r.valorUnitario == null ? (
                                <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>—</span>
                              ) : (
                                <>
                                  <div className="text-xs font-mono font-bold" style={{ color: "var(--text)" }}>
                                    {formatCurrency(r.valorUnitario)}
                                  </div>
                                  {r.valorUnitarioEm && (
                                    <div className="text-[9px] font-mono mt-0.5" style={{ color: "var(--text3)" }}
                                      title="Valor unitário da NF mais recente em que este produto apareceu">
                                      NF de {formatDate(r.valorUnitarioEm)}
                                    </div>
                                  )}
                                </>
                              )}
                            </Td>
                            <Td className="text-right">
                              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "rgba(249,115,22,.15)", color: "var(--accent)" }}>
                                {r.contagemUso}×
                              </span>
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card>
                )}
              </div>

              {/* Carrinho */}
              <Card className="lg:sticky lg:top-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart size={15} className="text-[var(--accent)]" />
                  <h3 className="text-xs uppercase tracking-widest font-mono font-bold" style={{ color: "var(--text3)" }}>
                    Orçamento
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: "var(--surface2)", color: "var(--text3)" }}>
                    {carrinho.length}
                  </span>
                </div>

                {carrinho.length === 0 ? (
                  <p className="text-xs py-6 text-center" style={{ color: "var(--text3)" }}>
                    Marque produtos na busca para montar o orçamento.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                      {carrinho.map((c) => {
                        const sub = (c.produto.valorUnitario || 0) * c.quantidade;
                        return (
                          <div key={c.produto.id} className="rounded-lg p-2" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-mono font-bold" style={{ color: "var(--accent)" }}>{c.produto.codigo}</div>
                                <div className="text-[11px] leading-tight truncate" title={c.produto.descricao} style={{ color: "var(--text)" }}>
                                  {c.produto.descricao}
                                </div>
                              </div>
                              <button onClick={() => alternar(c.produto)} className="p-1 rounded text-rose-500 hover:opacity-70" title="Remover">
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={c.quantidade || ""}
                                  onChange={(e) => mudarQtd(c.produto.id, e.target.value)}
                                  className="w-16 px-2 py-1 rounded text-xs font-mono outline-none"
                                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                                />
                                <span className="text-[10px]" style={{ color: "var(--text3)" }}>{c.produto.unidade || "un"}</span>
                                <span className="text-[10px]" style={{ color: "var(--text3)" }}>× {formatCurrency(c.produto.valorUnitario || 0)}</span>
                              </div>
                              <span className="text-xs font-mono font-bold" style={{ color: "var(--text)" }}>{formatCurrency(sub)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <textarea
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      rows={2}
                      placeholder="Observações (saem impressas)..."
                      className="w-full mt-3 px-2 py-1.5 rounded-lg text-xs outline-none resize-none"
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                    />

                    <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                      <span className="text-xs" style={{ color: "var(--text3)" }}>Total</span>
                      <span className="text-base font-mono font-bold" style={{ color: "var(--accent)" }}>{formatCurrency(totalCarrinho)}</span>
                    </div>

                    <div className="flex gap-2 mt-3">
                      <Button variant="ghost" size="sm" onClick={() => { setCarrinho([]); setObservacoes(""); }}>
                        <X size={13} /> Limpar
                      </Button>
                      <Button size="sm" className="flex-1" onClick={gerarOrcamento} loading={gerando}>
                        <Printer size={13} /> Gerar PDF
                      </Button>
                    </div>

                    <p className="text-[10px] mt-2 leading-tight" style={{ color: "var(--text3)" }}>
                      Valores a custo, por unidade de embalagem — CX é a caixa inteira, não o item avulso.
                    </p>
                  </>
                )}
              </Card>
            </div>
          ) : (
            <Card className="p-0 overflow-hidden">
              {loadingOrc ? (
                <div className="text-center py-8"><Loader2 size={20} className="animate-spin inline-block text-orange-500" /></div>
              ) : orcamentos.length === 0 ? (
                <Empty icon="📄" text="Nenhum orçamento ainda. Monte um na aba Catálogo." />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Código</Th>
                      <Th>Data</Th>
                      <Th>Emitido por</Th>
                      <Th className="text-right">Itens</Th>
                      <Th className="text-right">Total</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {orcamentos.map((o) => (
                      <Tr key={o.id}>
                        <Td><span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{o.codigo}</span></Td>
                        <Td><span className="text-xs font-mono" style={{ color: "var(--text2)" }}>{formatDate(o.createdAt)}</span></Td>
                        <Td><span className="text-xs">{o.criadoPor?.name || "—"}</span></Td>
                        <Td className="text-right"><span className="text-xs font-mono">{o._count?.itens || 0}</span></Td>
                        <Td className="text-right"><span className="text-xs font-mono font-bold">{formatCurrency(o.valorTotal)}</span></Td>
                        <Td>
                          <div className="flex justify-end">
                            <button
                              onClick={() => window.open(`/imprimir/orcamento/${o.id}`, "_blank")}
                              className="p-1.5 rounded-lg hover:opacity-70 inline-flex items-center gap-1"
                              style={{ background: "var(--surface2)", color: "var(--text2)" }}
                              title="Reimprimir"
                            >
                              <Printer size={13} /> <span className="text-xs">Imprimir</span>
                            </button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
