"use client";
import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { AcertoMotoristasTab } from "./AcertoMotoristasTab";
import { VisaoGeralTab } from "./VisaoGeralTab";
import { LancamentosTab } from "./LancamentosTab";
import { CategoriasTab } from "./CategoriasTab";

export default function FinanceiroPage() {
  const [activeTab, setActiveTab] = useState<"visao-geral" | "lancamentos" | "categorias" | "acerto-motoristas">("visao-geral");

  return (
    <>
      <Topbar 
        title="Módulo Financeiro (ERP)" 
        subtitle="Gestão de caixa, despesas, faturamento e acertos operacionais." 
      />

      <div className="px-6 border-b" style={{ borderColor: "var(--border)" }}>
        <nav className="flex gap-1 mt-2">
          <button
            onClick={() => setActiveTab("visao-geral")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === "visao-geral" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text2)]"}`}
          >
            Visão Geral
          </button>
          <button
            onClick={() => setActiveTab("lancamentos")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === "lancamentos" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text2)]"}`}
          >
            Lançamentos (Caixa)
          </button>
          <button
            onClick={() => setActiveTab("categorias")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === "categorias" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text2)]"}`}
          >
            Categorias
          </button>
          <button
            onClick={() => setActiveTab("acerto-motoristas")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === "acerto-motoristas" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text2)]"}`}
          >
            Acerto de Motoristas
          </button>
        </nav>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col bg-[var(--surface)]">
        {activeTab === "visao-geral" && <VisaoGeralTab />}
        {activeTab === "lancamentos" && <LancamentosTab />}
        {activeTab === "categorias" && <CategoriasTab />}
        {activeTab === "acerto-motoristas" && <AcertoMotoristasTab />}
      </div>
    </>
  );
}
