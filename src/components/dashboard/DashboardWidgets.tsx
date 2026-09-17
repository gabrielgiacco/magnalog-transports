"use client";

/**
 * Pecas visuais do dashboard, extraidas da pagina quando o design novo
 * ("Sistema TMS Magna") entrou — a pagina sozinha passaria do teto de 350
 * linhas. Sao componentes de apresentacao: nao buscam dado nem conhecem a API.
 */

export type Tone = "neutral" | "accent" | "cyan" | "danger" | "warning";

const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--text)",
  accent: "var(--accent)",
  cyan: "var(--cyan)",
  danger: "#ff4d4f",
  warning: "#f5a524",
};

/** Banner de abertura: saudacao, resumo do dia e dois numeros em destaque. */
export function HeroBanner({
  greeting, resumo, destaques,
}: {
  greeting: string;
  resumo: string;
  destaques: { label: string; value: string; hint: string; tone: "accent" | "cyan" }[];
}) {
  return (
    <section
      className="relative overflow-hidden flex flex-wrap items-center justify-between gap-5 px-5 py-5 rounded-[14px]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="ml-grid" />
      <div className="relative min-w-[240px] flex-1">
        <div className="font-mono text-[10px] tracking-[.2em]" style={{ color: "var(--cyan)" }}>
          OPERAÇÃO EM TEMPO REAL
        </div>
        <div className="mt-2 font-head text-[22px] sm:text-[25px] font-extrabold tracking-tight">{greeting}</div>
        <div className="mt-1.5 text-[13px] max-w-[460px]" style={{ color: "var(--text2)" }}>{resumo}</div>
      </div>
      <div className="relative flex gap-2.5 flex-wrap">
        {destaques.map((d) => {
          const color = TONE_COLOR[d.tone];
          const tint = d.tone === "accent" ? "rgba(249,115,22,.08)" : "rgba(34,211,238,.07)";
          const line = d.tone === "accent" ? "rgba(249,115,22,.28)" : "rgba(34,211,238,.25)";
          return (
            <div key={d.label} className="px-4 py-3 rounded-[11px] min-w-[132px]" style={{ background: tint, border: `1px solid ${line}` }}>
              <div className="font-mono text-[9px] tracking-[.16em]" style={{ color }}>{d.label}</div>
              <div className="mt-1 font-head text-[24px] font-extrabold tabular-nums" style={{ color }}>{d.value}</div>
              <div className="text-[11px]" style={{ color: "var(--text2)" }}>{d.hint}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function KpiTile({
  label, value, hint, icon, tone = "neutral",
}: {
  label: string; value: string; hint?: string; icon?: React.ReactNode; tone?: Tone;
}) {
  const color = TONE_COLOR[tone];
  return (
    <div
      className="relative overflow-hidden p-4 rounded-[13px] transition-colors"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${tone === "neutral" ? "var(--text3)" : color}, transparent)` }}
      />
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] uppercase tracking-[.14em]" style={{ color: "var(--text3)" }}>{label}</span>
        {icon && <span style={{ color }}>{icon}</span>}
      </div>
      <div className="font-head text-[24px] sm:text-[26px] font-extrabold tracking-tight tabular-nums" style={{ color }}>{value}</div>
      {hint && <div className="text-[11px] mt-1" style={{ color: "var(--text3)" }}>{hint}</div>}
    </div>
  );
}

export function AlertPill({ tone, icon, children }: { tone: "danger" | "warning"; icon: React.ReactNode; children: React.ReactNode }) {
  const bg = tone === "danger" ? "rgba(255,77,79,.07)" : "rgba(245,165,36,.07)";
  const border = tone === "danger" ? "rgba(255,77,79,.25)" : "rgba(245,165,36,.25)";
  const color = tone === "danger" ? "#ff4d4f" : "#f5a524";
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px]" style={{ background: bg, border: `1px solid ${border}`, color }}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

export function Panel({ title, subtitle, className = "", children }: { title: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-[13px] p-5 ${className}`} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="font-head text-[14px] font-bold tracking-tight">{title}</h3>
        {subtitle && (
          <span className="font-mono text-[10px] tracking-[.12em] uppercase whitespace-nowrap" style={{ color: "var(--text3)" }}>
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Uma linha do painel "Por status": rotulo, contagem, porcentagem e barra. */
export function StatusBar({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs" style={{ color: "var(--text2)" }}>{label}</span>
        <span className="text-[11px] font-mono" style={{ color }}>
          {count}
          <span className="ml-1.5" style={{ color: "var(--text3)" }}>{pct}%</span>
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
        <div
          className="h-full rounded-full transition-all duration-500 ml-bar-glow"
          style={{ width: `${pct}%`, background: color, "--bar": color } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

export function TH({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left font-mono text-[9.5px] uppercase tracking-[.14em] font-medium py-2.5 px-2.5 ${className}`}
      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}
    >
      {children}
    </th>
  );
}

export function TD({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`py-3 px-2.5 ${className}`} style={{ color: "var(--text)" }}>{children}</td>;
}

export function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold whitespace-nowrap"
      style={{ background: `${color}14`, color, border: `1px solid ${color}40` }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: color }} />
      {label.toUpperCase()}
    </span>
  );
}
