"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Loading, StatusBadge, Modal } from "@/components/ui";
import { formatWeight, formatDate, formatCurrency } from "@/lib/utils";
import { RefreshCw, ExternalLink, GripVertical, User, Package, Search, ShieldCheck } from "lucide-react";
import { QualityScoring } from "@/components/quality/QualityScoring";
import { QUALIDADE_ENABLED } from "@/lib/features";

const COLS = [
  { key: "PROGRAMADO",    label: "Programado",    icon: "📋", color: "#9ca3af" }, // cinza
  { key: "EM_SEPARACAO",  label: "Em Separação",  icon: "📦", color: "#f97316" }, // laranjado
  { key: "CARREGADO",     label: "Carregado",     icon: "🔄", color: "#38bdf8" }, // azul claro
  { key: "EM_ROTA",       label: "Em Rota",       icon: "🚛", color: "#eab308" }, // amarelo
  { key: "ENTREGUE",      label: "Entregue",      icon: "✅", color: "#10b981" }, // verde
  { key: "FINALIZADO",    label: "Finalizado",    icon: "🏁", color: "#a855f7" }, // roxo
  { key: "OCORRENCIA",    label: "Ocorrência",    icon: "⚠️", color: "#ef4444" }, // vermelho
];

function KanbanCard({ entrega, overlay = false }: { entrega: any; overlay?: boolean }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entrega.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  let borderColor = "var(--border)";
  let borderStyle = "solid";
  let borderWidth = "1px";

  if (entrega.isRota) {
    borderColor = "var(--accent)";
    borderStyle = "dashed";
    borderWidth = "1.5px";
  } else if (entrega.notas && entrega.notas.length > 1) {
    borderColor = "#eab308"; // amarelo para duplicadas/múltiplas
    borderWidth = "1.5px";
  } else if (entrega.status === "EM_ROTA") {
    borderColor = "#3b82f6"; // azul para em rota
    borderWidth = "1.5px";
  }

  const border = `${borderWidth} ${borderStyle} ${borderColor}`;

  const cardStyle = overlay ? {
    background: "var(--surface2)",
    border,
    boxShadow: "0 20px 40px rgba(0,0,0,.5)",
  } : {
    ...style,
    background: "var(--surface2)",
    border,
  };

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all
        ${overlay ? "shadow-2xl rotate-1 scale-105" : "hover:-translate-y-0.5 hover:shadow-lg"}`}
      {...(!overlay ? { ...attributes, ...listeners } : {})}
      style={cardStyle}>

      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" 
          style={{ 
            background: entrega.isRota ? "rgba(249,115,22,.15)" : "rgba(59,130,246,.1)", 
            color: entrega.isRota ? "var(--accent)" : "#3b82f6" 
          }}>
          {entrega.isRota ? "📦 ROTA" : "📄 NF"} {entrega.notas && entrega.notas.length > 0 
            ? entrega.notas.map((n: any) => n.numero).join(", ") 
            : entrega.codigo}
        </span>
        <div className="flex items-center gap-1">
          {QUALIDADE_ENABLED && entrega.qualidade?.id && (
            <span className="text-[10px] items-center text-center justify-center font-bold px-1 py-0.5 rounded"
              title="Possui registro de Qualidade" style={{ background: "rgba(234, 179, 8, 0.15)", color: "#ca8a04" }}>
              ⭐
            </span>
          )}
          {entrega.diarias?.length > 0 && (
            <span className="text-[10px] font-bold px-1 py-0.5 rounded"
              title={`${entrega.diarias.length} diária(s)`} style={{ background: "rgba(217,119,6,.18)", color: "#b45309" }}>
              💰
            </span>
          )}
          {entrega.dataAgendada && new Date(entrega.dataAgendada) < new Date() &&
            !["ENTREGUE", "FINALIZADO"].includes(entrega.status) && !entrega.isRota && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: "rgba(239,68,68,.2)", color: "#ef4444" }}>ATRASADO</span>
          )}
          {!entrega.isRota && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); router.push(`/entregas/${entrega.id}`); }}
              className="p-0.5 rounded hover:opacity-60 transition-all"
              style={{ color: "var(--text3)" }}>
              <ExternalLink size={11} />
            </button>
          )}
        </div>
      </div>

      <p className="text-sm font-semibold leading-tight mb-1 line-clamp-2">{entrega.razaoSocial}</p>
      {entrega.fornecedor && (
        <p className="text-[10px] mb-1 leading-tight" style={{ color: "var(--text2)" }}>
          Fornecedor: {entrega.fornecedor}
        </p>
      )}
      {entrega.isRota && entrega.notas && entrega.notas.length > 0 && (
        <p className="text-[10px] font-mono mb-2 leading-tight max-w-full" style={{ color: "var(--text3)" }}>
          <span className="font-bold">NFs:</span> {entrega.notas.map((n: any) => n.numero).join(", ")}
        </p>
      )}
      <p className="text-xs mb-3 flex items-center gap-1" style={{ color: "var(--text3)" }}>
        📍 {entrega.cidade}{entrega.uf ? `, ${entrega.uf}` : ""}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {entrega.motorista && (
            <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: "var(--text)" }}>
              <User size={10} style={{ color: "var(--text2)" }} /> {entrega.motorista.nome.split(" ")[0]}
            </span>
          )}
          {entrega.valorMotorista > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,.15)", color: "#10b981" }}>
              {formatCurrency(entrega.valorMotorista)}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatWeight(entrega.pesoTotal)}</span>
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const isReadOnly = role === "CONFERENTE";
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [qualityEntregaId, setQualityEntregaId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/kanban");
    const rawData = await res.json();
    
    if (Array.isArray(rawData)) {
      const processed: any[] = [];
      const groupedRotas: Record<string, any> = {};

      for (const e of rawData) {
        if (e.rotaId) {
          if (!groupedRotas[e.rotaId]) {
            groupedRotas[e.rotaId] = {
              id: `rota_${e.rotaId}`,
              status: e.status, // Rota card maps to current tracking status
              isRota: true,
              codigo: e.rota?.codigo || e.rotaId.substring(0, 5),
              razaoSocial: "",
              cidadesArray: [],
              cidade: "",
              uf: "",
              pesoTotal: 0,
              _count: { notas: 0 },
              notas: [],
              motorista: e.motorista,
              valorMotorista: e.rota?.valorMotorista || 0,
              entregasCount: 0,
              qualidade: e.qualidade,
            };
          }
          const r = groupedRotas[e.rotaId];
          r.pesoTotal += e.pesoTotal || 0;
          r._count.notas += e._count?.notas || 0;
          r.entregasCount++;
          if (e.cidade && !r.cidadesArray.includes(e.cidade)) {
            r.cidadesArray.push(e.cidade);
          }
          if (e.notas) r.notas.push(...e.notas);
          if (e.qualidade) r.qualidade = e.qualidade;
        } else {
          processed.push({
            ...e,
            fornecedor: e.notas?.[0]?.emitenteRazao || null,
          });
        }
      }

      for (const r of Object.values(groupedRotas)) {
        r.razaoSocial = `${r.entregasCount} Entregas Vinculadas na Rota`;
        r.cidade = r.cidadesArray.length > 0 ? r.cidadesArray.join(", ") : "Múltiplos Destinos";
        delete r.cidadesArray;
        processed.push(r);
      }
      setEntregas(processed);
    } else {
      setEntregas([]);
    }
    
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    // over.id can be either a column key or another card id
    // Check column first, then find which column the target card belongs to
    let targetColKey = COLS.find((c) => c.key === over.id)?.key;
    if (!targetColKey) {
      // dropped on a card — find which column that card is in
      const targetCard = entregas.find((e) => e.id === over.id);
      targetColKey = targetCard?.status;
    }
    if (!targetColKey) return;

    const entrega = entregas.find((e) => e.id === active.id);
    if (!entrega || entrega.status === targetColKey) return;

    setEntregas((prev) => prev.map((e) => e.id === active.id ? { ...e, status: targetColKey } : e));

    try {
      const res = await fetch("/api/kanban", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: active.id, status: targetColKey }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Movido para ${COLS.find((c) => c.key === targetColKey)?.label}`);
      if (targetColKey === "FINALIZADO" && QUALIDADE_ENABLED) {
        setQualityEntregaId(active.id as string);
      }
    } catch {
      toast.error("Erro ao atualizar status");
      setEntregas((prev) => prev.map((e) => e.id === active.id ? { ...e, status: entrega.status } : e));
    }
  }

  const activeEntrega = entregas.find((e) => e.id === activeId);
  const q = search.toLowerCase().trim();
  const filtered = q
    ? entregas.filter((e) =>
        e.razaoSocial?.toLowerCase().includes(q) ||
        e.fornecedor?.toLowerCase().includes(q) ||
        e.cidade?.toLowerCase().includes(q) ||
        e.codigo?.toLowerCase().includes(q) ||
        e.motorista?.nome?.toLowerCase().includes(q) ||
        e.notas?.some((n: any) => n.numero?.toLowerCase().includes(q) || n.emitenteRazao?.toLowerCase().includes(q))
      )
    : entregas;
  const grouped = COLS.reduce((acc, col) => {
    acc[col.key] = filtered.filter((e) => e.status === col.key);
    return acc;
  }, {} as Record<string, any[]>);

  if (loading) return <><Topbar title="Kanban Operacional" /><Loading /></>;

  return (
    <>
      <Topbar
        title="Kanban Operacional"
        subtitle={`${filtered.length} de ${entregas.length} entregas`}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar NF, cliente..."
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none w-[180px] lg:w-[220px] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)]"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={fetchData}>
              <RefreshCw size={13} /> <span className="hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        }
      />

      {/* Mobile search */}
      <div className="sm:hidden px-3 pt-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar NF, cliente, fornecedor..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-3 sm:p-4">
        <DndContext sensors={isReadOnly ? [] : sensors} collisionDetection={closestCenter}
          onDragStart={isReadOnly ? undefined : handleDragStart} onDragEnd={isReadOnly ? undefined : handleDragEnd}>
          <div className="flex gap-3 h-full" style={{ minWidth: "max-content" }}>
            {COLS.map((col) => {
              const colEntregas = grouped[col.key] || [];
              return (
                <ColDropZone key={col.key} col={col} entregas={colEntregas} colKey={col.key}>
                  <SortableContext items={colEntregas.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                    {colEntregas.map((e) => <KanbanCard key={e.id} entrega={e} />)}
                  </SortableContext>
                </ColDropZone>
              );
            })}
          </div>

          <DragOverlay>
            {activeEntrega ? <KanbanCard entrega={activeEntrega} overlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Quality Prompt Modal */}
      <Modal open={!!qualityEntregaId} onClose={() => setQualityEntregaId(null)} title="Avaliação de Qualidade Operacional" size="lg">
        <div className="mb-4 p-3 rounded-xl flex items-center gap-3" style={{ background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.2)" }}>
          <ShieldCheck size={20} className="text-orange-500 flex-shrink-0" />
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            Finalizado! Registre a avaliação de qualidade operacional antes de continuar.
          </p>
        </div>
        {qualityEntregaId && (
          <QualityScoring 
            entregaId={qualityEntregaId.startsWith("rota_") ? undefined : qualityEntregaId} 
            rotaId={qualityEntregaId.startsWith("rota_") ? qualityEntregaId.replace("rota_", "") : undefined} 
            onSave={() => { setQualityEntregaId(null); toast.success("Avaliação salva!"); }} 
          />
        )}
      </Modal>
    </>
  );
}

function ColDropZone({ col, entregas, colKey, children }: {
  col: (typeof COLS)[0]; entregas: any[]; colKey: string; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey });

  return (
    <div className="flex flex-col rounded-xl transition-all w-[240px] min-w-[240px] sm:w-[260px] sm:min-w-[260px]"
      style={{
        background: isOver ? "rgba(249,115,22,.03)" : "var(--surface)",
        border: `1px solid ${isOver ? "rgba(249,115,22,.3)" : "var(--border)"}`,
      }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 font-head text-[13px] font-bold" style={{ color: col.color }}>
          <span>{col.icon}</span> {col.label}
        </div>
        <span className="font-mono text-[11px] px-2 py-0.5 rounded-full"
          style={{ background: "var(--surface2)", color: "var(--text3)", border: "1px solid var(--border)" }}>
          {entregas.length}
        </span>
      </div>

      {/* Colored top accent */}
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: col.color }} />

      {/* Cards */}
      <div ref={setNodeRef} className="flex-1 overflow-y-auto p-3 space-y-2.5" style={{ minHeight: "120px", maxHeight: "calc(100vh - 200px)" }}>
        {children}
        {entregas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: "var(--text3)" }}>
            <span className="text-2xl opacity-20">{col.icon}</span>
            <span className="text-xs">Arraste aqui</span>
          </div>
        )}
      </div>
    </div>
  );
}
