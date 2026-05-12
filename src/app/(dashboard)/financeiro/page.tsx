"use client";
import { Topbar } from "@/components/layout/Topbar";
import { AcertoMotoristasTab } from "./AcertoMotoristasTab";

export default function FinanceiroPage() {
  return (
    <>
      <div className="flex-1 overflow-hidden flex flex-col bg-[var(--surface)]">
        <AcertoMotoristasTab />
      </div>
    </>
  );
}
