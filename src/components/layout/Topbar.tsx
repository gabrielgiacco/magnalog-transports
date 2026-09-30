"use client";
import { signOut } from "next-auth/react";
import { LogOut, Menu } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { useLayoutStore } from "@/hooks/useLayoutStore";

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  // Acoes do tamanho de um icone que nao podem quebrar para a 2a linha no celular.
  acoesRapidas?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions, acoesRapidas }: TopbarProps) {
  const { toggleSidebar } = useLayoutStore();

  return (
    // No celular a barra tentava caber numa linha so: menu, titulo, botoes da
    // pagina, tema, sino e "Sair" — o titulo sumia e os botoes saiam da tela.
    // Abaixo de md: 1a linha com menu, titulo e sino; os botoes da pagina
    // quebram para baixo (flex-wrap, sem rolagem lateral, que cortaria o menu
    // "Mais"); tema e Sair moram no rodape do menu lateral. De md para cima,
    // uma linha so, como antes.
    <header
      className="flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-2 px-3 py-2 md:px-5 md:py-0 md:h-[66px] flex-shrink-0 sticky top-0 z-30"
      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
    >
      {/* Filete laranja→ciano do design, puramente decorativo. */}
      <div className="ml-rule" />
      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-neutral-800 transition-colors flex-shrink-0"
          style={{ color: "var(--text2)" }}
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="font-head text-[15px] md:text-[16px] lg:text-[17px] font-extrabold tracking-tight leading-tight truncate" title={title}>{title}</h1>
          {subtitle && (
            <p className="hidden xs:block font-mono text-[10px] tracking-[.1em] mt-0.5 uppercase truncate" style={{ color: "var(--text3)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="order-last w-full md:order-none md:w-auto flex flex-wrap md:flex-nowrap items-center gap-2">
          {actions}
        </div>
      )}
      <div className="flex items-center gap-2 flex-shrink-0">
        {acoesRapidas}
        <div className="hidden sm:block">
          <GlobalSearch />
        </div>
        <div className="hidden md:block">
          <ThemeToggle />
        </div>
        <NotificationBell />
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-xs transition-all hover:opacity-80"
          style={{ background: "var(--surface2)", color: "var(--text2)", border: "1px solid var(--border)" }}
        >
          <LogOut size={13} />
          Sair
        </button>
      </div>
    </header>
  );
}
