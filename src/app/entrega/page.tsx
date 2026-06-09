"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, AlertCircle, ArrowRight } from "lucide-react";

export default function EntregaIndexPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (codigo.trim()) {
      router.push(`/entrega/${codigo.trim()}`);
    }
  }

  return (
    <div className="min-h-screen py-16 px-4 flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <img src="/logo.png" alt="MAGNALOG" className="h-12 w-auto object-contain mx-auto mb-4" />
          <h1 className="font-head text-2xl font-black mb-1">Rastreamento de Entrega</h1>
          <p className="text-xs font-mono tracking-widest uppercase" style={{ color: "var(--text3)" }}>
            Portal de Consulta Pública
          </p>
        </div>

        {/* Instruções solicitadas pelo usuário */}
        <div className="rounded-2xl p-6 border animate-fadeIn"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex gap-3 items-start mb-4">
            <div className="p-2 rounded-xl flex-shrink-0" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>
              <AlertCircle size={18} />
            </div>
            <div>
              <h2 className="font-head text-sm font-bold mb-1" style={{ color: "var(--text)" }}>Acesso Direto via Link</h2>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text2)" }}>
                Você esqueceu de colocar a barra (<code className="font-mono bg-[var(--surface2)] px-1 py-0.5 rounded text-[var(--accent)]">/</code>) e o número da nota fiscal ou código de rastreamento em seguida no endereço do seu navegador.
              </p>
            </div>
          </div>

          <div className="text-xs rounded-xl p-3 font-mono border"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text2)" }}>
            <span className="text-[var(--text3)]">Exemplo: </span>
            <a href="/entrega/123456" className="text-[var(--accent)] hover:underline break-all">
              https://tms-magnalog.vercel.app/entrega/123456
            </a>
          </div>
        </div>

        {/* Campo de Busca alternativo para melhorar a experiência */}
        <form onSubmit={handleSearch} className="rounded-2xl p-6 border space-y-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-xs font-semibold" style={{ color: "var(--text2)" }}>
            Ou digite o número da nota ou código abaixo:
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ex: 123456 ou ENT-00001"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none font-mono"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>
          <button
            type="submit"
            disabled={!codigo.trim()}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>Consultar Rastreamento</span>
            <ArrowRight size={14} />
          </button>
        </form>

        <p className="text-center text-xs" style={{ color: "var(--text3)" }}>
          MagnaLog TMS · Rastreamento em tempo real
        </p>
      </div>
    </div>
  );
}
