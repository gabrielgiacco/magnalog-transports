"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card, Loading, Empty, StatusBadge, Button, Table, Th, Td, Tr } from "@/components/ui";
import { formatDate, formatWeight, formatCurrency, formatCNPJ } from "@/lib/utils";
import { Search, RefreshCw, FileText, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

export default function NotasPage() {
  const router = useRouter();
  const [notas, setNotas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [semEntrega, setSemEntrega] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchNotas = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (semEntrega) params.set("semEntrega", "true");
    const res = await fetch(`/api/notas?${params}`);
    const data = await res.json();
    setNotas(data.notas || []);
    setTotal(data.total || 0);
    setPages(data.pages || 1);
    setLoading(false);
  }, [page, debouncedSearch, semEntrega]);

  useEffect(() => { fetchNotas(); }, [fetchNotas]);

  return (
    <>
      <Topbar
        title="Notas Fiscais"
        subtitle={`${total} nota${total !== 1 ? "s" : ""} importada${total !== 1 ? "s" : ""}`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => router.push("/importacao")}>
            <FileText size={14} /> Importar XML
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
        {/* Filters */}
        <Card className="p-4">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar NF, emitente, destinatário, chave..."
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "var(--text2)" }}>
              <input
                type="checkbox"
                checked={semEntrega}
                onChange={e => { setSemEntrega(e.target.checked); setPage(1); }}
                className="accent-orange-500 w-3.5 h-3.5"
              />
              Somente sem entrega vinculada
            </label>
            <Button variant="ghost" size="sm" onClick={fetchNotas}>
              <RefreshCw size={13} /> Atualizar
            </Button>
          </div>
        </Card>

        {/* Table */}
        <Card className="p-0 overflow-hidden">
          {loading ? (
            <Loading />
          ) : notas.length === 0 ? (
            <Empty icon="📄" text="Nenhuma nota fiscal encontrada" />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>NF / Série</Th>
                    <Th>Emitente</Th>
                    <Th>Destinatário</Th>
                    <Th>Cidade / UF</Th>
                    <Th>Vol.</Th>
                    <Th>Peso</Th>
                    <Th>Valor NF</Th>
                    <Th>Emissão</Th>
                    <Th>Entrega</Th>
                    <Th>Status</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {notas.map(nf => (
                    <Tr
                      key={nf.id}
                      onClick={() => nf.entrega && router.push(`/entregas/${nf.entrega.id}`)}
                      className={nf.entrega ? "" : "opacity-70"}
                    >
                      <Td>
                        <div className="font-mono text-sm font-semibold" style={{ color: "var(--accent)" }}>
                          NF {nf.numero}
                        </div>
                        {nf.serie && (
                          <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                            Série {nf.serie}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <div className="text-sm font-medium leading-tight">{nf.emitenteRazao}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                          {formatCNPJ(nf.emitenteCnpj)}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-sm leading-tight">{nf.destinatarioRazao}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                          {formatCNPJ(nf.destinatarioCnpj)}
                        </div>
                      </Td>
                      <Td>
                        <span className="text-xs" style={{ color: "var(--text2)" }}>
                          {nf.cidade}{nf.uf ? ` — ${nf.uf}` : ""}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-xs">{nf.volumes}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-xs" style={{ color: "var(--text2)" }}>
                          {formatWeight(nf.pesoBruto)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-xs" style={{ color: "#10b981" }}>
                          {formatCurrency(nf.valorNota)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[11px]" style={{ color: "var(--text3)" }}>
                          {formatDate(nf.dataEmissao)}
                        </span>
                      </Td>
                      <Td>
                        {nf.entrega ? (
                          <span className="font-mono text-[11px]" style={{ color: "var(--accent)" }}>
                            {nf.entrega.notas && nf.entrega.notas.length > 0 ? nf.entrega.notas.map((n: any) => n.numero).join(", ") : nf.entrega.codigo}
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                            style={{ background: "rgba(239,68,68,.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)" }}>
                            Sem entrega
                          </span>
                        )}
                      </Td>
                      <Td>
                        {nf.entrega ? (
                          <StatusBadge status={nf.entrega.status} />
                        ) : (
                          <span className="text-[10px]" style={{ color: "var(--text3)" }}>—</span>
                        )}
                      </Td>
                      <Td>
                        {nf.entrega && (
                          <button
                            onClick={ev => { ev.stopPropagation(); router.push(`/entregas/${nf.entrega.id}`); }}
                            className="p-1.5 rounded-lg transition-all hover:opacity-70"
                            style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                            <ExternalLink size={13} />
                          </button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>

              {/* Pagination */}
              {pages > 1 && (
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>
                    Página {page} de {pages} · {total} registros
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
