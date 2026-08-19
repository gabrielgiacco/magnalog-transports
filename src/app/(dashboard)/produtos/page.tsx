"use client";
import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, Empty, Table, Th, Td, Tr } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Search, RefreshCw, Boxes, Copy, Loader2, Database } from "lucide-react";

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
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [totalCatalogo, setTotalCatalogo] = useState<number | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const debounceRef = useRef<any>(null);

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

  async function runBackfill() {
    if (!confirm("Reprocessar o histórico de NFs para atualizar o catálogo de produtos? Pode demorar alguns segundos.")) return;
    setBackfilling(true);
    try {
      const r = await fetch("/api/produtos/backfill", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro");
      setTotalCatalogo(d.totalNoBanco);
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
        <div className="max-w-6xl mx-auto space-y-4">
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
                Digite ao menos 2 caracteres. O sistema quebra sua busca em palavras e casa qualquer parte da descrição — insensível a maiúsculas e acentos.
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
                    <Th>Código</Th>
                    <Th>Descrição</Th>
                    <Th>Fornecedor</Th>
                    <Th className="text-right">NCM</Th>
                    <Th className="text-right">Valor Un.</Th>
                    <Th className="text-right">Uso</Th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r) => (
                    <Tr key={r.id}>
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
                        <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{r.ncm || "—"}</span>
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
      </div>
    </>
  );
}
