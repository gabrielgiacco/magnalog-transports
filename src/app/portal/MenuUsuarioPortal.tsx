"use client";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

// Menu do usuario no celular: avatar com inicial que abre nome, e-mail, tema e sair
export function MenuUsuarioPortal({ user }: { user: any }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, toggle, mounted } = useTheme();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const inicial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  const escuro = mounted ? theme === "dark" : true;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Menu do usuário"
        aria-expanded={aberto}
        className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white"
        style={user?.image ? undefined : { background: "linear-gradient(140deg,#f97316,#c2410c)" }}
      >
        {user?.image ? <img src={user.image} alt="" className="w-full h-full object-cover" /> : inicial}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full mt-2 w-60 rounded-xl shadow-2xl z-50 overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-[11px] truncate" style={{ color: "var(--text3)" }}>{user?.email}</div>
          </div>
          <button type="button" onClick={toggle}
            className="w-full flex items-center gap-2.5 px-3 py-3 text-sm text-left"
            style={{ color: "var(--text2)" }}>
            {escuro ? <Sun size={15} /> : <Moon size={15} />}
            {escuro ? "Tema claro" : "Tema escuro"}
          </button>
          <button type="button" onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-2.5 px-3 py-3 text-sm text-left"
            style={{ color: "var(--text2)", borderTop: "1px solid var(--border)" }}>
            <LogOut size={15} /> Sair
          </button>
        </div>
      )}
    </div>
  );
}
