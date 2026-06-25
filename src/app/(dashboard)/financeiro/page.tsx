"use client";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { AcertoMotoristasTab } from "./AcertoMotoristasTab";
import { PainelTab } from "./PainelTab";
import { LancamentosTab } from "./LancamentosTab";
import { ContasPagarTab } from "./ContasPagarTab";
import { ContasReceberTab } from "./ContasReceberTab";
import { FluxoCaixaTab } from "./FluxoCaixaTab";
import { DreTab } from "./DreTab";
import { LayoutDashboard, HandCoins, ArrowDownToLine, ArrowUpFromLine, FilePlus, LineChart, FileBarChart2 } from "lucide-react";

type Tab = "painel" | "acertos" | "lancamentos" | "contas-pagar" | "contas-receber" | "fluxo-caixa" | "dre";

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "painel", label: "Painel", icon: LayoutDashboard },
  { key: "acertos", label: "Acertos", icon: HandCoins },
  { key: "lancamentos", label: "Lançamentos", icon: FilePlus },
  { key: "contas-pagar", label: "Contas a Pagar", icon: ArrowDownToLine },
  { key: "contas-receber", label: "Contas a Receber", icon: ArrowUpFromLine },
  { key: "fluxo-caixa", label: "Fluxo de Caixa", icon: LineChart },
  { key: "dre", label: "DRE", icon: FileBarChart2 },
];

export default function FinanceiroPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as Tab) || "painel";
  const [tab, setTab] = useState<Tab>(initialTab);

  function changeTab(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    router.replace(url.pathname + url.search, { scroll: false });
  }

  const subtitle = (() => {
    switch (tab) {
      case "painel": return "Visão geral do caixa, recebimentos e pagamentos";
      case "acertos": return "Acerto de motoristas terceiros";
      case "lancamentos": return "Receitas e despesas avulsas";
      case "contas-pagar": return "Despesas a pagar";
      case "contas-receber": return "Recebimentos de clientes";
      case "fluxo-caixa": return "Projeção 30/60/90 dias";
      case "dre": return "Demonstrativo de Resultado do Exercício";
    }
  })();

  return (
    <>
      <Topbar title="Financeiro" subtitle={subtitle} />
      <div className="flex-1 overflow-y-auto">
        {/* Tabs */}
        <div className="sticky top-0 z-10 bg-[var(--surface)] border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex overflow-x-auto">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => changeTab(t.key)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all border-b-2 whitespace-nowrap
                    ${active ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                >
                  <t.icon size={16} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-3 sm:p-6">
          {tab === "painel" && <PainelTab />}
          {tab === "acertos" && <AcertoMotoristasTab embedded />}
          {tab === "lancamentos" && <LancamentosTab />}
          {tab === "contas-pagar" && <ContasPagarTab />}
          {tab === "contas-receber" && <ContasReceberTab />}
          {tab === "fluxo-caixa" && <FluxoCaixaTab />}
          {tab === "dre" && <DreTab />}
        </div>
      </div>
    </>
  );
}
