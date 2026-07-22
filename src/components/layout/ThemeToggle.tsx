"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, toggle, mounted } = useTheme();

  // Evita hydration mismatch — mostra o mesmo ícone que o server renderizou
  // até o hook ter lido o localStorage.
  const isDark = mounted && theme === "dark";

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg transition-colors hover:bg-neutral-800/40"
      style={{ color: "var(--text2)" }}
      title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
