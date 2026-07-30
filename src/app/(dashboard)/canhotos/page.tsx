"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import {
  Button, Card, Loading, Empty, Modal, Input, Select,
  Table, Th, Td, Tr,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";
import {
  Image as ImageIcon, HardDrive, AlertTriangle, Trash2, RefreshCw,
  ChevronLeft, ChevronRight, Eye, Square, CheckSquare,
} from "lucide-react";

const TIPO_LABELS: Record<string, string> = {
  CANHOTO: "Canhoto",
  CANHOTO_DESCARGA: "Canhoto+Descarga",
  DESCARGA: "Descarga",
  FOTO: "Foto",
  DOCUMENTO: "Documento",
  OUTRO: "Outro",
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function corBarra(percent: number) {
  if (percent >= 90) return "#ef4444";
  if (percent >= 70) return "#eab308";
  return "#10b981";
}

export default function CanhotosPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [storage, setStorage] = useState<any>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [canhotos, setCanhotos] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [somaBytesFiltro, setSomaBytesFiltro] = useState(0);

  const [ordem, setOrdem] = useState<"asc" | "desc">("asc");
  const [tipo, setTipo] = useState("");
  const [mesInicio, setMesInicio] = useState("");
  const [mesFim, setMesFim] = useState("");

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadStorage = useCallback(async () => {
    try {
      const res = await fetch("/api/storage/status");
      if (res.ok) setStorage(await res.json());
    } catch {}
  }, []);

  const loadCanhotos = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        ordem,
        ...(tipo ? { tipo } : {}),
        ...(mesInicio ? { mesInicio } : {}),
        ...(mesFim ? { mesFim } : {}),
      });
      const res = await fetch(`/api/canhotos?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCanhotos(data.canhotos || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
        setSomaBytesFiltro(data.somaBytesFiltro || 0);
      }
    } finally {
      setLoadingList(false);
    }
  }, [page, ordem, tipo, mesInicio, mesFim]);

  useEffect(() => { loadStorage(); }, [loadStorage]);
  useEffect(() => { loadCanhotos(); }, [loadCanhotos]);

  function toggle(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleTodos() {
    setSelecionados((prev) => {
      if (prev.size === canhotos.length) return new Set();
      return new Set(canhotos.map((c) => c.id));
    });
  }
  function limparFiltros() {
    setTipo(""); setMesInicio(""); setMesFim(""); setOrdem("asc"); setPage(1);
  }

  async function handleDelete() {
    if (!isAdmin) { toast.error("Apenas ADMIN pode deletar"); return; }
    if (selecionados.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/canhotos/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selecionados) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao deletar");
      toast.success(`${data.deletados} canhoto(s) excluído(s) — ${formatBytes(data.bytesLiberados)} liberados`);
      if (data.erros?.length) console.warn("Erros parciais:", data.erros);
      setSelecionados(new Set());
      setConfirmOpen(false);
      await Promise.all([loadStorage(), loadCanhotos()]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  }

  const bytesSelecionados = canhotos
    .filter((c) => selecionados.has(c.id))
    .reduce((s, c) => s + (c.size || 0), 0);

  const percent = storage?.percentUsado || 0;
  const cor = corBarra(percent);

  return (
    <>
      <Topbar
        title="Canhotos"
        subtitle="Gestão manual do armazenamento de canhotos e anexos de entrega"
        actions={
          <Button variant="ghost" onClick={() => { loadStorage(); loadCanhotos(); }}>
            <RefreshCw size={14} /> Atualizar
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {/* Card de Storage */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `${cor}15`, border: `1px solid ${cor}30` }}>
                <HardDrive size={18} style={{ color: cor }} />
              </div>
              <div>
                <div className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--text3)" }}>
                  Armazenamento Cloudflare R2
                </div>
                <div className="text-lg font-bold font-mono">
                  {storage
                    ? `${storage.usadoGB.toFixed(2)} GB / ${storage.limiteGB} GB`
                    : "Carregando…"}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text2)" }}>
                  {storage ? `${storage.totalCanhotos} canhotos + ${storage.totalAnexosPolim} anexos gerais` : ""}
                </div>
              </div>
            </div>
            {storage?.precisaAlerta && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: "#ef4444" }}>
                <AlertTriangle size={14} />
                Restam apenas {storage.disponivelGB.toFixed(2)} GB — libere espaço
              </div>
            )}
          </div>

          {/* Barra */}
          <div className="mt-4">
            <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
              <div
                className="h-full transition-all"
                style={{ width: `${Math.min(100, percent)}%`, background: cor }}
              />
            </div>
            <div className="mt-1 text-[11px] font-mono" style={{ color: "var(--text3)" }}>
              {storage ? `${percent.toFixed(1)}% usado • ${storage.disponivelGB.toFixed(2)} GB disponíveis` : ""}
            </div>
          </div>
        </Card>

        {/* Filtros */}
        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest mb-1 block" style={{ color: "var(--text3)" }}>Ordem</label>
              <Select value={ordem} onChange={(e) => { setOrdem(e.target.value as any); setPage(1); }}>
                <option value="asc">Mais antigos primeiro</option>
                <option value="desc">Mais novos primeiro</option>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest mb-1 block" style={{ color: "var(--text3)" }}>Tipo</label>
              <Select value={tipo} onChange={(e) => { setTipo(e.target.value); setPage(1); }}>
                <option value="">Todos</option>
                <option value="CANHOTO">Canhoto</option>
                <option value="CANHOTO_DESCARGA">Canhoto+Descarga</option>
                <option value="DESCARGA">Descarga</option>
                <option value="FOTO">Foto</option>
                <option value="DOCUMENTO">Documento</option>
                <option value="OUTRO">Outro</option>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest mb-1 block" style={{ color: "var(--text3)" }}>Mês início</label>
              <Input type="month" value={mesInicio} onChange={(e) => { setMesInicio(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest mb-1 block" style={{ color: "var(--text3)" }}>Mês fim</label>
              <Input type="month" value={mesFim} onChange={(e) => { setMesFim(e.target.value); setPage(1); }} />
            </div>
            <div>
              <Button variant="ghost" onClick={limparFiltros}>Limpar filtros</Button>
            </div>
          </div>
          <div className="mt-3 text-[11px] font-mono" style={{ color: "var(--text2)" }}>
            <b>{total}</b> resultado(s) — <b>{formatBytes(somaBytesFiltro)}</b> no filtro atual
          </div>
        </Card>

        {/* Tabela */}
        <Card className="overflow-hidden">
          {loadingList ? (
            <Loading text="Carregando canhotos…" />
          ) : canhotos.length === 0 ? (
            <Empty text="Nenhum canhoto encontrado" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>
                      <button onClick={toggleTodos} title="Selecionar todos da página">
                        {selecionados.size === canhotos.length && canhotos.length > 0
                          ? <CheckSquare size={14} />
                          : <Square size={14} />}
                      </button>
                    </Th>
                    <Th>Entrega</Th>
                    <Th>Tipo</Th>
                    <Th>Arquivo</Th>
                    <Th>Tamanho</Th>
                    <Th>Data upload</Th>
                    <Th>Por</Th>
                    <Th>Ação</Th>
                  </tr>
                </thead>
                <tbody>
                  {canhotos.map((c) => {
                    const sel = selecionados.has(c.id);
                    return (
                      <Tr key={c.id} onClick={() => toggle(c.id)}
                        style={{ background: sel ? "rgba(249,115,22,.06)" : undefined, cursor: "pointer" }}>
                        <Td onClick={(e) => { e.stopPropagation(); toggle(c.id); }}>
                          {sel ? <CheckSquare size={14} style={{ color: "var(--accent)" }} /> : <Square size={14} />}
                        </Td>
                        <Td>
                          <div className="font-mono text-xs font-bold">{c.entrega?.codigo || "—"}</div>
                          <div className="text-[10px]" style={{ color: "var(--text3)" }}>
                            {c.entrega?.razaoSocial || ""}{c.entrega?.cidade ? ` — ${c.entrega.cidade}/${c.entrega.uf || ""}` : ""}
                          </div>
                        </Td>
                        <Td><span className="text-xs">{TIPO_LABELS[c.tipo] || c.tipo}</span></Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <ImageIcon size={13} style={{ color: "var(--text3)" }} />
                            <span className="text-xs truncate max-w-[200px]" title={c.filename}>{c.filename}</span>
                          </div>
                        </Td>
                        <Td><span className="font-mono text-xs">{formatBytes(c.size || 0)}</span></Td>
                        <Td><span className="font-mono text-xs">{formatDate(c.createdAt)}</span></Td>
                        <Td><span className="text-xs">{c.uploadadoPor?.name || "—"}</span></Td>
                        <Td onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => window.open(`/entregas/${c.entregaId}`, "_blank")}
                            title="Abrir entrega"
                            style={{ color: "var(--text2)" }}
                          >
                            <Eye size={14} />
                          </button>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}

          {/* Paginação */}
          {pages > 1 && (
            <div className="flex items-center justify-between p-3" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="text-xs font-mono" style={{ color: "var(--text2)" }}>
                Página {page} de {pages}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft size={14} />
                </Button>
                <Button variant="ghost" size="sm" disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>

      {/* Barra sticky de ação */}
      {selecionados.size > 0 && (
        <div
          className="sticky bottom-0 z-40 px-4 py-3 flex items-center justify-between gap-3"
          style={{
            background: "var(--surface)",
            borderTop: "2px solid var(--accent)",
            boxShadow: "0 -8px 24px rgba(0,0,0,.15)",
          }}
        >
          <div className="text-sm">
            <b>{selecionados.size}</b> selecionado(s) — <b>{formatBytes(bytesSelecionados)}</b>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelecionados(new Set())}>
              Cancelar
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!isAdmin}
              title={!isAdmin ? "Apenas ADMIN pode deletar" : ""}
              style={{ background: "#ef4444", color: "white" }}
            >
              <Trash2 size={14} /> Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      {/* Modal de confirmação */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirmar exclusão">
        <div className="space-y-4">
          <div className="p-3 rounded-lg" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)" }}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
              <div className="text-sm">
                Você vai excluir <b>{selecionados.size}</b> canhoto(s) totalizando <b>{formatBytes(bytesSelecionados)}</b>.
                <br />
                <span style={{ color: "var(--text2)" }}>Os arquivos serão removidos do R2 e do banco. Esta ação é irreversível.</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button onClick={handleDelete} loading={deleting} style={{ background: "#ef4444", color: "white" }}>
              <Trash2 size={14} /> Confirmar exclusão
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
