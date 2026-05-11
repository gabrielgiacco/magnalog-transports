"use client";
import { Topbar } from "@/components/layout/Topbar";
import { AcertoMotoristasTab } from "./AcertoMotoristasTab";

export default function FinanceiroPage() {
  return (
    <>
      <Topbar 
        title="Financeiro" 
        subtitle="Acerto de motoristas e controle de pagamentos." 
      />

      <div className="flex-1 overflow-hidden flex flex-col bg-[var(--surface)]">
        <AcertoMotoristasTab />
      </div>
    </>
  );
}
