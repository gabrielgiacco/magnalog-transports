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
    <div className="flex flex-col h-full bg-[#0B1120]">
      <div className="px-6 pt-4 pb-2">
        <h1 className="text-2xl font-black text-white font-head tracking-tight">Módulo Financeiro (ERP)</h1>
        <p className="text-sm text-slate-400 mt-1">Gestão de caixa, despesas, faturamento e acertos operacionais.</p>
      </div>

      <div className="px-6 border-b border-slate-800">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab("visao-geral")}
            className={`pb-3 text-sm font-medium transition-colors ${activeTab === "visao-geral" ? "border-b-2 border-rose-500 text-rose-500" : "text-slate-400 hover:text-slate-200"}`}
          >
            Visão Geral
          </button>
          <button
            onClick={() => setActiveTab("lancamentos")}
            className={`pb-3 text-sm font-medium transition-colors ${activeTab === "lancamentos" ? "border-b-2 border-rose-500 text-rose-500" : "text-slate-400 hover:text-slate-200"}`}
          >
            Lançamentos (Caixa)
          </button>
          <button
            onClick={() => setActiveTab("categorias")}
            className={`pb-3 text-sm font-medium transition-colors ${activeTab === "categorias" ? "border-b-2 border-rose-500 text-rose-500" : "text-slate-400 hover:text-slate-200"}`}
          >
            Categorias
          </button>
          <button
            onClick={() => setActiveTab("acerto-motoristas")}
            className={`pb-3 text-sm font-medium transition-colors ${activeTab === "acerto-motoristas" ? "border-b-2 border-rose-500 text-rose-500" : "text-slate-400 hover:text-slate-200"}`}
          >
            Acerto de Motoristas
          </button>
        </nav>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "visao-geral" && <VisaoGeralTab />}
        {activeTab === "lancamentos" && <LancamentosTab />}
        {activeTab === "categorias" && <CategoriasTab />}
        {activeTab === "acerto-motoristas" && <AcertoMotoristasTab />}
      </div>
    </div>
  );
}
