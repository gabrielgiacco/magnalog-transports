"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";

export interface AcaoMenu {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** Cor do icone — o que antes era a borda colorida do botao na barra. */
  cor?: string;
  title?: string;
}

export interface GrupoAcoes {
  titulo: string;
  itens: AcaoMenu[];
}

/**
 * Menu "Mais" da barra de acoes. Existe para tirar da barra as acoes de uso
 * eventual, que somadas deixavam o topo da entrega com 9 a 11 botoes. Grupo
 * sem item nao rende cabecalho; menu sem nenhum item nao rende o botao.
 * Fecha ao escolher, ao clicar fora e com Esc — mesmo idioma de clique-fora
 * do NotificationBell.
 */
export function AcoesMenu({ grupos }: { grupos: GrupoAcoes[] }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const visiveis = grupos.filter((g) => g.itens.length > 0);
  if (visiveis.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="sm" onClick={() => setAberto((a) => !a)} aria-haspopup="menu" aria-expanded={aberto}>
        <MoreHorizontal size={14} /> Mais <ChevronDown size={12} />
      </Button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-50 w-60 rounded-xl py-1.5 shadow-2xl"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {visiveis.map((grupo, gi) => (
            <div key={grupo.titulo} className={gi > 0 ? "mt-1 pt-1" : ""} style={gi > 0 ? { borderTop: "1px solid var(--border)" } : undefined}>
              <div className="px-3 pt-1.5 pb-1 font-mono text-[9px] tracking-[.18em] uppercase" style={{ color: "var(--text3)" }}>
                {grupo.titulo}
              </div>
              {grupo.itens.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  title={item.title}
                  onClick={() => {
                    setAberto(false);
                    item.onClick();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--surface2)]"
                  style={{ color: "var(--text)" }}
                >
                  <item.icon size={14} style={{ color: item.cor || "var(--text2)" }} />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
