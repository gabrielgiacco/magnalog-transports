"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Loading, Modal, Empty } from "@/components/ui";
import toast from "react-hot-toast";
import { Upload, Search, Trash2, Truck, RefreshCw, ExternalLink, CheckCircle, AlertTriangle, X, Link2 } from "lucide-react";
import { formatCurrency, formatDate, formatCNPJ } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface CteItem {
  id: string;
  numero: string;
  serie: string | null;
  chaveAcesso: string;
  dataEmissao: string | null;
  valorReceber: number;
  valorPedagio: number;
  emitenteCnpj: string;
  emitenteNome: string | null;
  tomadorCnpj: string;
  tomadorNome: string | null;
  faturaId: string | null;
  fatura?: { id: string; numero: string; status: string } | null;
  notas: Array<{
    id: string;
    numero: string;
    serie: string | null;
    entregaId: string | null;
    entrega?: { id: string; codigo: string; razaoSocial: string; cidade: string | null; uf: string | null } | null;
  }>;
}

export function CteTab() {
  const router = useRouter();
  const [items, setItems] = useState<CteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [semVinculo, setSemVinculo] = useState(false);
  const [semFatura, setSemFatura] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [linkModal, setLinkModal] = useState<{ open: boolean; cte: CteItem | null }>({ open: false, cte: null });
  const [linkSearch, setLinkSearch] = useState("");
  const [notasBusca, setNotasBusca] = useState<any[]>([]);
  const [notasSelecionadas, setNotasSelecionadas] = useState<Set<string>>(new Set());
  const [linkSaving, setLinkSaving] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (semVinculo) params.set("semVinculo", "true");
      if (semFatura) params.set("semFatura", "true");
      const res = await fetch(`/api/ctes?${params}`);
      const data = await res.json();
      setItems(data.itens || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {
      toast.error("Erro ao carregar CT-e");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, semVinculo, semFatura]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 350); return () => clearTimeout(t); }, [search]);

  async function handleImport() {
    if (files.length === 0) { toast.error("Selecione ao menos um XML de CT-e"); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/importacao", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao importar"); return; }
      setImportResult(data);
      const msgs: string[] = [];
      if (data.ctesImportados > 0) msgs.push(`${data.ctesImportados} CT-e(s) importado(s)`);
      if (data.duplicadas > 0) msgs.push(`${data.duplicadas} duplicado(s)`);
      if (data.erros?.length > 0) msgs.push(`${data.erros.length} erro(s)`);
      toast.success(msgs.join(" · ") || "Importação concluída");
      setFiles([]);
      fetchList();
    } catch (e: any) {
      toast.error(e.message || "Erro ao importar");
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(cte: CteItem) {
    if (cte.fatura) {
      toast.error("CT-e está em fatura. Cancele a fatura antes.");
      return;
    }
    if (!confirm(`Excluir CT-e ${cte.numero}? As notas serão desvinculadas e o frete das entregas zerado se não houver outro CT-e.`)) return;
    try {
      const res = await fetch(`/api/ctes/${cte.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao excluir"); return; }
      toast.success("CT-e excluído");
      fetchList();
    } catch {
      toast.error("Erro ao excluir");
    }
  }

  async function openLinkModal(cte: CteItem) {
    setLinkModal({ open: true, cte });
    setLinkSearch("");
    setNotasSelecionadas(new Set(cte.notas.map((n) => n.id)));
    // Carrega notas do tomador (pra vincular)
    const res = await fetch(`/api/notas?q=${encodeURIComponent(cte.tomadorNome || "")}&limit=100`);
    const data = await res.json();
    // Inclui as já vinculadas na lista
    const jaVinculadas = cte.notas.map((n) => ({ ...n, _jaVinculada: true }));
    setNotasBusca([...jaVinculadas, ...(data.notas || []).filter((n: any) => !cte.notas.some((c) => c.id === n.id))]);
  }

  useEffect(() => {
    if (!linkModal.open || !linkModal.cte) return;
    const t = setTimeout(async () => {
      const cte = linkModal.cte!;
      const url = linkSearch.trim()
        ? `/api/notas?q=${encodeURIComponent(linkSearch)}&limit=100`
        : `/api/notas?q=${encodeURIComponent(cte.tomadorNome || "")}&limit=100`;
      const res = await fetch(url);
      const data = await res.json();
      const jaVinculadas = cte.notas.map((n) => ({ ...n, _jaVinculada: true }));
      setNotasBusca([...jaVinculadas, ...(data.notas || []).filter((n: any) => !cte.notas.some((c) => c.id === n.id))]);
    }, 300);
    return () => clearTimeout(t);
  }, [linkSearch, linkModal.open, linkModal.cte]);

  function toggleNota(id: string) {
    setNotasSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveLink() {
    if (!linkModal.cte) return;
    setLinkSaving(true);
    try {
      const res = await fetch(`/api/ctes/${linkModal.cte.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notaIds: Array.from(notasSelecionadas) }),
      });
      if (!res.ok) { toast.error("Erro ao atualizar vínculo"); return; }
      toast.success("Vínculo atualizado");
      setLinkModal({ open: false, cte: null });
      fetchList();
    } catch {
      toast.error("Erro ao atualizar vínculo");
    } finally {
      setLinkSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Uploader */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Truck size={18} style={{ color: "var(--accent)" }} />
          <div className="text-sm font-bold font-head">Importar CT-e</div>
        </div>
        <div
          className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-orange-500/50"
          style={{ borderColor: "var(--border)", background: "var(--surface2)" }}
          onClick={() => document.getElementById("cte-file-input")?.click()}
        >
          <Upload size={28} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {files.length > 0 ? `${files.length} arquivo(s) selecionado(s)` : "Clique para selecionar XMLs de CT-e"}
          </p>
          <p className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>
            Aceita múltiplos arquivos .xml — auto-vincula às NFs por chave de acesso
          </p>
          <input id="cte-file-input" type="file" multiple accept=".xml" className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </div>
        {files.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded text-[11px]" style={{ background: "var(--surface2)" }}>
                <span className="font-mono truncate flex-1">{f.name}</span>
                <span className="text-slate-400 ml-2">{(f.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {files.length > 0 && <Button variant="ghost" onClick={() => setFiles([])}>Limpar</Button>}
          <Button onClick={handleImport} loading={importing} disabled={files.length === 0}>
            <Upload size={14} /> Importar {files.length > 0 ? `(${files.length})` : ""}
          </Button>
        </div>

        {importResult && (
          <div className="p-3 rounded-lg text-xs space-y-1" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            {importResult.ctesImportados > 0 && (
              <div className="flex items-center gap-2 text-emerald-600"><CheckCircle size={14} /> {importResult.ctesImportados} CT-e importado(s)</div>
            )}
            {importResult.duplicadas > 0 && (
              <div className="flex items-center gap-2 text-amber-600"><AlertTriangle size={14} /> {importResult.duplicadas} duplicado(s)</div>
            )}
            {importResult.erros?.length > 0 && (
              <div className="text-red-500">
                <div className="flex items-center gap-2"><AlertTriangle size={14} /> {importResult.erros.length} erro(s):</div>
                <ul className="ml-6 mt-1 list-disc">
                  {importResult.erros.map((e: any, i: number) => (
                    <li key={i} className="text-[10px]">{e.arquivo}: {e.erro}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Filtros + Lista */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por número, chave, transportadora, tomador..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={semVinculo} onChange={(e) => { setSemVinculo(e.target.checked); setPage(1); }}
              className="accent-orange-500" />
            <span style={{ color: "var(--text2)" }}>Só sem NFs</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={semFatura} onChange={(e) => { setSemFatura(e.target.checked); setPage(1); }}
              className="accent-orange-500" />
            <span style={{ color: "var(--text2)" }}>Só sem fatura</span>
          </label>
          <Button variant="ghost" size="sm" onClick={fetchList}><RefreshCw size={14} /> Atualizar</Button>
          <span className="text-xs ml-auto" style={{ color: "var(--text3)" }}>{total} registro(s)</span>
        </div>

        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty icon="🚚" text="Nenhum CT-e encontrado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: "var(--surface2)" }}>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Número</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Emissão</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Transportadora</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Tomador</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>NFs / Entregas</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Valor Frete</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Fatura</th>
                  <th className="text-center px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const entregasSet = new Set(i.notas.map((n) => n.entrega?.codigo).filter(Boolean));
                  return (
                    <tr key={i.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--accent)" }}>
                        {i.numero}{i.serie ? `/${i.serie}` : ""}
                      </td>
                      <td className="px-3 py-2 font-mono">{i.dataEmissao ? formatDate(i.dataEmissao) : "—"}</td>
                      <td className="px-3 py-2 max-w-[180px]">
                        <div className="truncate" title={i.emitenteNome || ""}>{i.emitenteNome || "—"}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(i.emitenteCnpj)}</div>
                      </td>
                      <td className="px-3 py-2 max-w-[180px]">
                        <div className="truncate" title={i.tomadorNome || ""}>{i.tomadorNome || "—"}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(i.tomadorCnpj)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-[11px]">
                          {i.notas.length === 0 ? (
                            <span style={{ color: "var(--text3)" }}>Sem NFs vinculadas</span>
                          ) : (
                            <>
                              <span className="font-bold">{i.notas.length}</span> NF(s)
                              {entregasSet.size > 0 && (
                                <> · <span className="font-mono">{Array.from(entregasSet).slice(0, 2).join(", ")}{entregasSet.size > 2 ? `+${entregasSet.size - 2}` : ""}</span></>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-right" style={{ color: "#059669" }}>{formatCurrency(i.valorReceber)}</td>
                      <td className="px-3 py-2">
                        {i.fatura ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                            style={{
                              background: i.fatura.status === "PAGA" ? "rgba(5,150,105,.12)" : "rgba(249,115,22,.12)",
                              color: i.fatura.status === "PAGA" ? "#059669" : "#f97316"
                            }}
                          >
                            {i.fatura.numero} · {i.fatura.status}
                          </span>
                        ) : (
                          <span className="text-[11px]" style={{ color: "var(--text3)" }}>Sem fatura</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openLinkModal(i)}
                            className="p-1.5 rounded hover:bg-slate-100"
                            title="Editar vínculo com NFs"
                          >
                            <Link2 size={13} className="text-slate-500" />
                          </button>
                          {i.notas[0]?.entrega && (
                            <button
                              onClick={() => router.push(`/entregas/${i.notas[0].entrega!.id}`)}
                              className="p-1.5 rounded hover:bg-slate-100"
                              title="Abrir entrega"
                            >
                              <ExternalLink size={13} className="text-slate-500" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(i)}
                            className="p-1.5 rounded hover:bg-red-50 disabled:opacity-30"
                            title={i.fatura ? "CT-e em fatura — cancele antes" : "Excluir"}
                            disabled={!!i.fatura}
                          >
                            <Trash2 size={13} className="text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px]" style={{ color: "var(--text3)" }}>Página {page} de {pages}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="ghost" size="sm" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal de vínculo com NFs */}
      <Modal
        open={linkModal.open}
        onClose={() => setLinkModal({ open: false, cte: null })}
        title={`Vincular NFs ao CT-e ${linkModal.cte?.numero || ""}`}
        size="lg"
      >
        <div className="space-y-3">
          <div className="text-xs p-3 rounded-lg" style={{ background: "var(--surface2)", color: "var(--text2)" }}>
            Marque as NFs cobertas por este CT-e. O valor de <strong>{formatCurrency(linkModal.cte?.valorReceber || 0)}</strong> será rateado igualmente entre as entregas resultantes.
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Buscar NF por número, emitente..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {notasBusca.length === 0 ? (
              <div className="text-center py-6 text-xs" style={{ color: "var(--text3)" }}>Nenhuma NF encontrada</div>
            ) : (
              notasBusca.map((n: any) => {
                const marcada = notasSelecionadas.has(n.id);
                return (
                  <label
                    key={n.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: marcada ? "rgba(249,115,22,.06)" : "var(--surface)",
                      border: `1px solid ${marcada ? "rgba(249,115,22,.3)" : "var(--border)"}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => toggleNota(n.id)}
                      className="accent-orange-500 w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold">NF {n.numero}{n.serie ? `/${n.serie}` : ""}</div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                        {n.emitenteRazao || n.entrega?.razaoSocial || ""}
                        {n.entrega && <> · Entrega {n.entrega.codigo}</>}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="ghost" onClick={() => setLinkModal({ open: false, cte: null })}>Cancelar</Button>
          <Button onClick={handleSaveLink} loading={linkSaving}>Salvar vínculo</Button>
        </div>
      </Modal>
    </div>
  );
}
