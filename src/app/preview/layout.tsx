export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "#0a0a0a",
        color: "#ededed",
        fontFamily: "'Inter', system-ui, sans-serif",
        // Vercel-ish CSS custom props scoped to this preview only
        // Uses your Magna Log orange as brand accent
        // @ts-ignore
        "--v-bg": "#0a0a0a",
        "--v-surface": "#111111",
        "--v-surface-2": "#171717",
        "--v-border": "#262626",
        "--v-border-strong": "#404040",
        "--v-text": "#ededed",
        "--v-text-2": "#a3a3a3",
        "--v-text-3": "#737373",
        "--v-accent": "#f97316",
        "--v-accent-hover": "#ea580c",
        "--v-success": "#00d084",
        "--v-warning": "#f5a524",
        "--v-danger": "#ff4d4f",
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
