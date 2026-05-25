"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Package, FileText, Users, Route, X } from "lucide-react";
import { StatusBadge } from "@/components/ui";

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (query) search(query); else setResults(null); }, 300);
    return () => clearTimeout(t);
  }, [query, search]);

  function navigate(path: string) {
    router.push(path);
    setOpen(false);
    setQuery("");
    setResults(null);
  }

  const hasResults = results && (
    results.entregas?.length > 0 ||
    results.notas?.length > 0 ||
    results.clientes?.length > 0 ||
    results.rotas?.length > 0
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all hover:opacity-80"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text3)" }}>
        <Search size={13} />
        <span className="hidden sm:block text-xs">Buscar...</span>
        <kbd className="hidden sm:block text-[9px] px-1.5 py-0.5 rounded font-mono"
          style={{ background: "var(--border)", color: "var(--text3)" }}>⌘K</kbd>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 w-[480px] rounded-2xl shadow-2xl z-50 overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border2)" }}>
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <Search size={16} style={{ color: "var(--text3)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar entrega, NF, cliente, rota..."
              className="flex-1 text-sm outline-none bg-transparent"
              style={{ color: "var(--text)" }}
              autoComplete="off"
            />
            {query && (
              <button onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}>
                <X size={14} style={{ color: "var(--text3)" }} />
              </button>
            )}
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8 gap-2" style={{ color: "var(--text3)" }}>
                <div className="w-4 h-4 rounded-full border border-t-transparent animate-spin" style={{ borderTopColor: "var(--accent)" }} />
                <span className="text-xs">Buscando...</span>
              </div>
            )}

            {!loading && query.length < 2 && (
              <div className="py-8 text-center text-xs" style={{ color: "var(--text3)" }}>
                Digite pelo menos 2 caracteres para buscar
              </div>
            )}

            {!loading && query.length >= 2 && !hasResults && (
              <div className="py-8 text-center text-xs" style={{ color: "var(--text3)" }}>
                Nenhum resultado para &ldquo;{query}&rdquo;
              </div>
            )}

            {!loading && hasResults && (
              <div className="py-2">
                {/* Entregas */}
                {results.entregas?.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest flex items-center gap-2"
                      style={{ color: "var(--text3)" }}>
                      <Package size={10} /> Entregas
                    </div>
                    {results.entregas.map((e: any) => (
                      <button key={e.id} onClick={() => navigate(`/entregas/${e.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:bg-[#162030]">
                        <span className="font-mono text-[11px] w-20 flex-shrink-0" style={{ color: "var(--accent)" }}>
                          {e.notas && e.notas.length > 0 ? e.notas.map((n: any) => n.numero).join(", ") : e.codigo}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{e.razaoSocial}</div>
                          {e.endereco && (
                            <div className="text-[11px] truncate" style={{ color: "var(--text3)" }}>
                              {e.endereco}
                            </div>
                          )}
                        </div>
                        <span className="text-xs flex-shrink-0" style={{ color: "var(--text3)" }}>{e.cidade}</span>
                        <StatusBadge status={e.status} />
                      </button>
                    ))}
                  </div>
                )}

                {/* Notas */}
                {results.notas?.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 mt-1"
                      style={{ color: "var(--text3)", borderTop: "1px solid var(--border)" }}>
                      <FileText size={10} /> Notas Fiscais
                    </div>
                    {results.notas.map((n: any) => (
                      <button key={n.id}
                        onClick={() => n.entregaId ? navigate(`/entregas/${n.entregaId}`) : navigate("/notas")}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:bg-[#162030]">
                        <span className="font-mono text-[11px] w-20 flex-shrink-0" style={{ color: "var(--text3)" }}>NF {n.numero}</span>
                        <span className="text-sm flex-1 truncate">{n.destinatarioRazao}</span>
                        <span className="text-xs flex-shrink-0" style={{ color: "var(--text3)" }}>{n.emitenteRazao}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Rotas */}
                {results.rotas?.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 mt-1"
                      style={{ color: "var(--text3)", borderTop: "1px solid var(--border)" }}>
                      <Route size={10} /> Rotas
                    </div>
                    {results.rotas.map((r: any) => (
                      <button key={r.id} onClick={() => navigate(`/rotas/${r.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:bg-[#162030]">
                        <span className="font-mono text-[11px] w-20 flex-shrink-0" style={{ color: "var(--accent)" }}>{r.codigo}</span>
                        <StatusBadge status={r.status} />
                        <span className="text-xs ml-auto" style={{ color: "var(--text3)" }}>
                          {r.data ? new Date(r.data).toLocaleDateString("pt-BR") : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Clientes */}
                {results.clientes?.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 mt-1"
                      style={{ color: "var(--text3)", borderTop: "1px solid var(--border)" }}>
                      <Users size={10} /> Clientes
                    </div>
                    {results.clientes.map((c: any) => (
                      <button key={c.id} onClick={() => navigate(`/entregas?cliente=${encodeURIComponent(c.razaoSocial)}`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:bg-[#162030]">
                        <span className="text-sm flex-1">{c.razaoSocial}</span>
                        <span className="font-mono text-[10px]" style={{ color: "var(--text3)" }}>{c.cnpj}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 flex items-center gap-4 text-[10px]"
            style={{ borderTop: "1px solid var(--border)", color: "var(--text3)" }}>
            <span>↑↓ navegar</span>
            <span>↵ abrir</span>
            <span>Esc fechar</span>
          </div>
        </div>
      )}
    </div>
  );
}
