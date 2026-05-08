"use client";
import { cn } from "@/lib/utils";
import { Loader2, X, ChevronDown } from "lucide-react";
import { forwardRef, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, useState } from "react";

// ─── Button ──────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}
export function Button({ variant = "primary", size = "md", loading, children, className, disabled, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all cursor-pointer border";
  const vars = {
    primary: "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 active:scale-95 shadow-sm",
    ghost: "text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800 active:scale-95",
    danger: "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 active:scale-95",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 active:scale-95",
  };
  const sizes = { sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2", lg: "text-sm px-5 py-2.5" };
  return (
    <button {...props} disabled={disabled || loading}
      className={cn(base, vars[variant], sizes[size], (disabled || loading) && "opacity-50 cursor-not-allowed", className)}
      style={{ background: variant === "ghost" ? "var(--surface2)" : undefined, fontFamily: "'Inter', sans-serif" }}>
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

// ─── Input ───────────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, className, ...props }, ref) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>{label}</label>}
    <input ref={ref} {...props}
      className={cn("w-full px-3 py-2 rounded-lg text-sm outline-none transition-all", className)}
      style={{
        background: "var(--surface2)", border: "1px solid var(--border)",
        color: "var(--text)", fontFamily: "'Inter', sans-serif",
        ...(error ? { borderColor: "#ef4444" } : {}),
      }}
      onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; props.onFocus?.(e); }}
      onBlur={(e) => { e.target.style.borderColor = error ? "#ef4444" : "var(--border)"; props.onBlur?.(e); }}
    />
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
));
Input.displayName = "Input";

// ─── Select ──────────────────────────────────────────────────────────────────
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, className, children, ...props }, ref) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>{label}</label>}
    <div className="relative">
      <select ref={ref} {...props}
        className={cn("w-full pl-3 pr-8 py-2 rounded-lg text-sm outline-none appearance-none transition-all", className)}
        style={{
          background: "var(--surface2)", border: "1px solid var(--border)",
          color: "var(--text)", fontFamily: "'Inter', sans-serif",
        }}>
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text3)" }} />
    </div>
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
));
Select.displayName = "Select";

// ─── Textarea ─────────────────────────────────────────────────────────────────
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }>(
  ({ label, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>{label}</label>}
      <textarea ref={ref} {...props} rows={props.rows || 3}
        className={cn("w-full px-3 py-2 rounded-lg text-sm outline-none transition-all resize-none", className)}
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontFamily: "'Inter', sans-serif" }}
        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
      />
    </div>
  )
);
Textarea.displayName = "Textarea";

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn("rounded-xl p-5", className)}
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      {children}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = "md" }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  if (!open) return null;
  const sizes = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("w-full rounded-t-2xl sm:rounded-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto animate-fadeIn shadow-2xl", sizes[size])}
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 sticky top-0 z-10" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
          <h2 className="font-head text-base sm:text-lg font-bold tracking-tight truncate pr-2">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-all hover:opacity-70 flex-shrink-0"
            style={{ background: "var(--surface2)", color: "var(--text2)" }}>
            <X size={16} />
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PROGRAMADO: "Programado", EM_SEPARACAO: "Em Separação", CARREGADO: "Carregado",
    EM_ROTA: "Em Rota", ENTREGUE: "Entregue", FINALIZADO: "Finalizado", OCORRENCIA: "Ocorrência",
    PLANEJADA: "Planejada", EM_ANDAMENTO: "Em Andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada",
    ADMIN: "Admin", FINANCEIRO: "Financeiro", OPERACIONAL: "Operacional", CLIENTE: "Cliente",
  };
  return <span className={`badge badge-${status}`}>{labels[status] || status}</span>;
}

// ─── Loading ──────────────────────────────────────────────────────────────────
export function Loading({ text = "Carregando..." }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20">
      <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)" }} />
      <span className="text-sm" style={{ color: "var(--text2)" }}>{text}</span>
    </div>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────────
export function Empty({ icon = "📭", text = "Nenhum registro encontrado" }: { icon?: string; text?: string }) {
  return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3 opacity-30">{icon}</div>
      <p className="text-sm" style={{ color: "var(--text3)" }}>{text}</p>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse", className)}>{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono", className)}
      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
      {children}
    </th>
  );
}
export function Td({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={cn("px-4 py-3 text-sm", className)}>{children}</td>;
}
export function Tr({ children, onClick, className, style }: { children: React.ReactNode; onClick?: () => void; className?: string; style?: React.CSSProperties }) {
  return (
    <tr
      onClick={onClick}
      className={cn("transition-colors", onClick && "cursor-pointer hover:bg-slate-50", className)}
      style={{ borderBottom: "1px solid var(--border)", ...style }}>
      {children}
    </tr>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, sub, icon, color = "#f97316", trend }: {
  label: string; value: string | number; sub?: string; icon: string; color?: string; trend?: { value: string; up: boolean };
}) {
  return (
    <div className="rounded-xl p-3 sm:p-5 relative overflow-hidden transition-transform hover:-translate-y-0.5 shadow-sm"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: color === "#f97316" ? "var(--accent)" : color }} />
      <div className="text-[8px] sm:text-[10px] uppercase tracking-widest font-mono mb-1 sm:mb-2 truncate" style={{ color: "var(--text3)" }}>{label}</div>
      <div className="font-head text-xl sm:text-3xl font-black tracking-tight truncate" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] sm:text-xs mt-0.5 sm:mt-1 truncate" style={{ color: "var(--text3)" }}>{sub}</div>}
      {trend && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${trend.up ? "text-emerald-400" : "text-red-400"}`}>
          {trend.up ? "↑" : "↓"} {trend.value}
        </div>
      )}
      <div className="absolute right-2 sm:right-4 top-3 sm:top-4 text-xl sm:text-3xl opacity-10">{icon}</div>
    </div>
  );
}

// ─── Combobox Motorista ───────────────────────────────────────────────────────
export function ComboboxMotorista({
  motoristas, veiculos, value, onChange, onAutoFillVeiculo
}: {
  motoristas: any[]; veiculos: any[]; value: string;
  onChange: (id: string) => void; onAutoFillVeiculo: (veiculoId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = motoristas.find((m) => m.id === value);
  const filtered = motoristas.filter((m) => m.nome.toLowerCase().includes(search.toLowerCase()));

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    onAutoFillVeiculo("");
    setSearch("");
  }

  return (
    <div className="flex flex-col gap-1.5 w-full relative">
      <label className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>Motorista</label>
      <div 
        className="w-full px-3 py-2 rounded-lg text-sm border cursor-text transition-all flex items-center justify-between gap-1"
        style={{ background: "var(--surface2)", borderColor: open ? "var(--accent)" : "var(--border)", color: "var(--text)", fontFamily: "'Inter', sans-serif" }}
        onClick={() => setOpen(true)}
      >
        {open ? (
          <input
            autoFocus
            className="bg-transparent outline-none w-full"
            value={search} onChange={(e) => setSearch(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            placeholder="Buscar motorista..."
          />
        ) : (
          <span className={selected ? "" : "opacity-50"}>{selected?.nome || "Selecionar..."}</span>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {selected && !open && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-red-100 transition-colors"
              title="Limpar motorista"
            >
              <X size={14} className="text-red-400" />
            </button>
          )}
          <ChevronDown size={14} style={{ color: "var(--text3)" }} />
        </div>
      </div>

      {open && (
        <div className="absolute top-[100%] left-0 right-0 mt-1 rounded-lg shadow-lg border z-50 overflow-hidden max-h-48 overflow-y-auto"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {/* Opção de limpar motorista */}
          {value && (
            <div
              className="flex items-center gap-2 p-3 text-sm hover:bg-red-50 cursor-pointer transition-colors"
              style={{ borderBottom: "1px solid var(--border)" }}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("");
                onAutoFillVeiculo("");
                setOpen(false);
                setSearch("");
              }}
            >
              <X size={13} className="text-red-400" />
              <span className="font-medium text-red-500">Limpar motorista</span>
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-center opacity-50">Nenhum encontrado</div>
          ) : (
            filtered.map((m) => {
              // Buscar veiculo associado a este motorista
              const v = veiculos.find((vei) => vei.motoristaId === m.id);
              return (
                <div key={m.id}
                  className="flex items-center justify-between p-3 text-sm hover:bg-slate-50 cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(m.id);
                    if (v) onAutoFillVeiculo(v.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="font-medium text-slate-800">{m.nome}</span>
                  <span className="text-xs font-mono text-slate-400">
                    {v ? `${v.placa} · ${v.tipo}` : "Sem veículo"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
