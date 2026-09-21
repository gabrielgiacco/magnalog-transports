"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { INTERVALO_SINAL_MS } from "@/lib/presenca";

/**
 * Sinal de presenca: avisa /api/presenca qual tela esta aberta. Sem UI.
 *
 * Pinga ao montar, a cada troca de rota e a cada INTERVALO_SINAL_MS enquanto
 * a aba esta visivel; aba oculta nao pinga, e assim vira "ausente" e depois
 * encerra sozinha no servidor. Erro e silencioso: presenca nao pode
 * atrapalhar a navegacao.
 */
export function PresencaBeacon() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;

  // CLIENTE nao e rastreado — e o middleware nega /api/* fora do portal para ele.
  const ativo = !!role && role !== "CLIENTE";

  useEffect(() => {
    if (!ativo || !pathname) return;

    const sinal = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/presenca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tela: pathname }),
        keepalive: true,
      }).catch(() => {});
    };

    sinal();
    const timer = setInterval(sinal, INTERVALO_SINAL_MS);
    document.addEventListener("visibilitychange", sinal);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sinal);
    };
  }, [ativo, pathname]);

  return null;
}
