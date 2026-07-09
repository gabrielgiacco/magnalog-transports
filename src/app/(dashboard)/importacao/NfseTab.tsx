"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Loading, Modal, Input, Empty } from "@/components/ui";
import toast from "react-hot-toast";
import { Upload, Search, Trash2, Link2, Receipt, RefreshCw, ExternalLink, CheckCircle, AlertTriangle, X } from "lucide-react";
import { formatCurrency, formatDate, formatCNPJ } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface NfseItem {
  id: string;
  numero: string;
  codigoVerificacao: string | null;
  dataEmissao: string;
  valorServicos: number;
  aliquota: number;
  prestadorCnpj: string;
  prestadorRazao: string | null;
  tomadorCnpj: string;
  tomadorRazao: string | null;
  discriminacao: string | null;
  informacoesAdicionais: string | null;
  entregaId: string | null;
  notaFiscalId: string | null;
  entrega?: { id: string; codigo: string; razaoSocial: string; cidade: string | null; uf: string | null } | null;
  notaFiscal?: { id: string; numero: string; serie: string | null; emitenteRazao: string } | null;
}

export function NfseTab() {
  const router = useRouter();
  const [items, setItems] = useState<NfseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [semVinculo, setSemVinculo] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [linkModal, setLinkModal] = useState<{ open: boolean; nfse: NfseItem | null }>({ open: false, nfse: null });
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<any[]>([]);
  const [linkSaving, setLinkSaving] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (semVinculo) params.set("semVinculo", "true");
      const res = await fetch(`/api/nfse?${params}`);
      const data = await res.json();
      setItems(data.itens || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {
      toast.error("Erro ao carregar Notas de Serviço");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, semVinculo]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 350); return () => clearTimeout(t); }, [search]);

  async function handleImport() {
    if (files.length === 0) { toast.error("Selecione ao menos um XML de NFS-e"); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/nfse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao importar"); return; }
      setImportResult(data);
      const msgs: string[] = [];
      if (data.importadas > 0) msgs.push(`${data.importadas} importada(s)`);
      if (data.vinculadasAutomaticamente > 0) msgs.push(`${data.vinculadasAutomaticamente} vinculada(s) auto`);
      if (data.duplicadas > 0) msgs.push(`${data.duplicadas} duplicada(s)`);
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

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta NFS-e? O lançamento financeiro vinculado também será removido.")) return;
    try {
      const res = await fetch(`/api/nfse/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Erro ao excluir"); return; }
      toast.success("NFS-e excluída");
      fetchList();
    } catch {
      toast.error("Erro ao excluir");
    }
  }

  function openLinkModal(nfse: NfseItem) {
    setLinkModal({ open: true, nfse });
    setLinkSearch("");
    setLinkResults([]);
    // Carrega entregas recentes por padrão
    fetch(`/api/entregas?limit=20`)
      .then((r) => r.json())
      .then((d) => setLinkResults(d.entregas || []));
  }

  useEffect(() => {
    if (!linkModal.open) return;
    const t = setTimeout(() => {
      const url = linkSearch.trim() ? `/api/entregas?cliente=${encodeURIComponent(linkSearch)}&limit=20` : `/api/entregas?limit=20`;
      fetch(url).then((r) => r.json()).then((d) => setLinkResults(d.entregas || []));
    }, 300);
    return () => clearTimeout(t);
  }, [linkSearch, linkModal.open]);

  async function handleLinkEntrega(entregaId: string) {
    if (!linkModal.nfse) return;
    setLinkSaving(true);
    try {
      const res = await fetch(`/api/nfse/${linkModal.nfse.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entregaId }),
      });
      if (!res.ok) { toast.error("Erro ao vincular"); return; }
      toast.success("Vínculo atualizado");
      setLinkModal({ open: false, nfse: null });
      fetchList();
    } catch {
      toast.error("Erro ao vincular");
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleUnlink(id: string) {
    if (!confirm("Remover vínculo desta NFS-e com a entrega?")) return;
    try {
      const res = await fetch(`/api/nfse/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entregaId: null, notaFiscalId: null }),
      });
      if (!res.ok) { toast.error("Erro ao desvincular"); return; }
      toast.success("Vínculo removido");
      fetchList();
    } catch {
      toast.error("Erro ao desvincular");
    }
  }

  return (
    <div className="space-y-5">
      {/* Uploader */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Receipt size={18} style={{ color: "var(--accent)" }} />
          <div className="text-sm font-bold font-head">Importar Notas de Serviço (NFS-e)</div>
        </div>
        <div
          className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-orange-500/50"
          style={{ borderColor: "var(--border)", background: "var(--surface2)" }}
          onClick={() => document.getElementById("nfse-file-input")?.click()}
        >
          <Upload size={28} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {files.length > 0 ? `${files.length} arquivo(s) selecionado(s)` : "Clique para selecionar XMLs de NFS-e"}
          </p>
          <p className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>
            Suporta múltiplos arquivos .xml (padrão ABRASF)
          </p>
          <input id="nfse-file-input" type="file" multiple accept=".xml" className="hidden"
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
            {importResult.importadas > 0 && (
              <div className="flex items-center gap-2 text-emerald-600"><CheckCircle size={14} /> {importResult.importadas} NFS-e importada(s)</div>
            )}
            {importResult.vinculadasAutomaticamente > 0 && (
              <div className="flex items-center gap-2 text-blue-600"><Link2 size={14} /> {importResult.vinculadasAutomaticamente} vinculada(s) automaticamente</div>
            )}
            {importResult.duplicadas > 0 && (
              <div className="flex items-center gap-2 text-amber-600"><AlertTriangle size={14} /> {importResult.duplicadas} duplicada(s)</div>
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
              placeholder="Buscar por número, tomador, descrição..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={semVinculo} onChange={(e) => { setSemVinculo(e.target.checked); setPage(1); }}
              className="accent-orange-500" />
            <span style={{ color: "var(--text2)" }}>Só sem vínculo</span>
          </label>
          <Button variant="ghost" size="sm" onClick={fetchList}><RefreshCw size={14} /> Atualizar</Button>
          <span className="text-xs ml-auto" style={{ color: "var(--text3)" }}>{total} registro(s)</span>
        </div>

        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty icon="🧾" text="Nenhuma NFS-e encontrada" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: "var(--surface2)" }}>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Número</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Emissão</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Tomador</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Descrição</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Valor</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Vínculo</th>
                  <th className="text-center px-3 py-2 text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--text2)" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--accent)" }}>{i.numero}</td>
                    <td className="px-3 py-2 font-mono">{formatDate(i.dataEmissao)}</td>
                    <td className="px-3 py-2 max-w-[220px]">
                      <div className="truncate" title={i.tomadorRazao || ""}>{i.tomadorRazao || "—"}</div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(i.tomadorCnpj)}</div>
                    </td>
                    <td className="px-3 py-2 max-w-[260px]">
                      <div className="truncate text-[11px]" title={i.discriminacao || i.informacoesAdicionais || ""}>
                        {i.discriminacao || i.informacoesAdicionais || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-right" style={{ color: "#059669" }}>{formatCurrency(i.valorServicos)}</td>
                    <td className="px-3 py-2">
                      {i.entrega ? (
                        <button
                          onClick={() => router.push(`/entregas/${i.entrega!.id}`)}
                          className="flex items-center gap-1 text-[11px] font-bold hover:underline"
                          style={{ color: "var(--accent)" }}
                          title="Abrir entrega"
                        >
                          <ExternalLink size={11} /> {i.entrega.codigo}
                        </button>
                      ) : (
                        <span className="text-[11px]" style={{ color: "var(--text3)" }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openLinkModal(i)}
                          className="p-1.5 rounded hover:bg-slate-100"
                          title={i.entrega ? "Alterar vínculo" : "Vincular à entrega"}
                        >
                          <Link2 size={13} className="text-slate-500" />
                        </button>
                        {i.entrega && (
                          <button
                            onClick={() => handleUnlink(i.id)}
                            className="p-1.5 rounded hover:bg-slate-100"
                            title="Remover vínculo"
                          >
                            <X size={13} className="text-slate-500" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(i.id)}
                          className="p-1.5 rounded hover:bg-red-50"
                          title="Excluir"
                        >
                          <Trash2 size={13} className="text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {/* Modal de vínculo */}
      <Modal open={linkModal.open} onClose={() => setLinkModal({ open: false, nfse: null })} title={`Vincular NFS-e ${linkModal.nfse?.numero || ""} à entrega`} size="lg">
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por NF, cliente, código..."
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {linkResults.length === 0 ? (
              <div className="text-center py-6 text-xs" style={{ color: "var(--text3)" }}>Nenhuma entrega encontrada</div>
            ) : (
              linkResults.map((e: any) => (
                <button
                  key={e.id}
                  onClick={() => handleLinkEntrega(e.id)}
                  disabled={linkSaving}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors border"
                  style={{ borderColor: "var(--border)", background: linkModal.nfse?.entregaId === e.id ? "rgba(249,115,22,.08)" : "transparent" }}
                >
                  <div className="text-sm font-bold">{e.razaoSocial}</div>
                  <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>
                    {e.codigo} · {e.cidade || "—"}{e.uf ? `-${e.uf}` : ""}
                    {e.notas?.length > 0 && <> · NFs: {e.notas.map((n: any) => n.numero).join(", ")}</>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
