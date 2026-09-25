"use client";
import type { DepositoItem } from "@prisma/client";
import { Button, Card, Loading, Empty, Table, Th, Td, Tr } from "@/components/ui";
import { formatCNPJ } from "@/lib/utils";
import { Eye, PackageCheck } from "lucide-react";
import { TIPOS_ENTRADA, corDias, labelTipo, fmtKg, fmtBRL, LIMITE_ATENCAO, LIMITE_CRITICO } from "./deposito-ui";

// Espelha o GET /api/deposito: o DepositoItem do Prisma mais o que a rota
// calcula antes de devolver (registradoPor, diasParados, saldo).
export interface DepositoItemRow extends DepositoItem {
  registradoPor: { name: string | null };
  diasParados: number;
  saldo: number;
}

interface DepositoTabelaProps {
  items: DepositoItemRow[];
  loading: boolean;
  onBaixa: (item: DepositoItemRow) => void;
  onDetalhe: (item: DepositoItemRow) => void;
}

// Cor do tipo de entrada em fundo claro — mesmo idioma de STATUS_COLORS em
// paletes/page.tsx, só que a cor vem do vocabulário compartilhado.
function estiloTipo(tipo: string) {
  const cor = TIPOS_ENTRADA.find((t) => t.value === tipo)?.cor || "#94a3b8";
  return { background: `${cor}22`, color: cor };
}

function PillDias({ dias }: { dias: number }) {
  const cor = corDias(dias);
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `${cor}22`, color: cor }}
      title={`Parado há ${dias} dia(s) — atenção a partir de ${LIMITE_ATENCAO}, crítico a partir de ${LIMITE_CRITICO}`}
    >
      {dias}d
    </span>
  );
}

function Acoes({ item, onBaixa, onDetalhe }: {
  item: DepositoItemRow;
  onBaixa: (i: DepositoItemRow) => void;
  onDetalhe: (i: DepositoItemRow) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {item.status !== "BAIXADO" && (
        <Button variant="ghost" size="sm" onClick={() => onBaixa(item)}>
          <PackageCheck size={13} /> Baixa
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => onDetalhe(item)}>
        <Eye size={13} /> Detalhe
      </Button>
    </div>
  );
}

export function DepositoTabela({ items, loading, onBaixa, onDetalhe }: DepositoTabelaProps) {
  if (loading) return <Card className="p-0 overflow-hidden"><Loading /></Card>;
  if (items.length === 0) {
    return <Card className="p-0 overflow-hidden"><Empty icon="📦" text="Nenhuma mercadoria parada" /></Card>;
  }

  return (
    <Card className="p-0 overflow-hidden">
      {/* Mobile: lista de cards */}
      <div className="block md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
        {items.map((item) => (
          <div key={item.id} className="p-3">
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="font-mono text-[11px] font-bold" style={{ color: "var(--accent)" }}>{item.codigo}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={estiloTipo(item.tipoEntrada)}>
                  {labelTipo(item.tipoEntrada)}
                </span>
                <PillDias dias={item.diasParados} />
              </div>
            </div>
            <div className="text-sm font-semibold truncate">{item.embarcadorRazao}</div>
            <div className="text-[11px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(item.embarcadorCnpj)}</div>
            <div className="text-[11px] mt-1 truncate" style={{ color: "var(--text2)" }}>{item.descricao}</div>
            <div className="text-[11px] mt-1.5" style={{ color: "var(--text3)" }}>
              NF {item.notaNumero || "—"} · {item.saldo}/{item.volumes} vol · {fmtKg(item.pesoKg)} · {fmtBRL(item.valorMercadoria)}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] truncate" style={{ color: "var(--text3)" }}>{item.localizacao || "—"}</span>
              <Acoes item={item} onBaixa={onBaixa} onDetalhe={onDetalhe} />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <thead>
            <Tr>
              <Th>Código</Th>
              <Th>NF</Th>
              <Th>Embarcador</Th>
              <Th>Descrição</Th>
              <Th>Tipo</Th>
              <Th>Vol</Th>
              <Th>Peso</Th>
              <Th>Valor</Th>
              <Th>Local</Th>
              <Th>Dias</Th>
              <Th></Th>
            </Tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Tr key={item.id}>
                <Td className="font-mono text-xs">{item.codigo}</Td>
                <Td>{item.notaNumero ? `${item.notaNumero}${item.notaSerie ? "/" + item.notaSerie : ""}` : "—"}</Td>
                <Td>
                  <div className="max-w-[180px] truncate">{item.embarcadorRazao}</div>
                  <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatCNPJ(item.embarcadorCnpj)}</div>
                </Td>
                <Td><div className="max-w-[220px] truncate">{item.descricao}</div></Td>
                <Td>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={estiloTipo(item.tipoEntrada)}>
                    {labelTipo(item.tipoEntrada)}
                  </span>
                </Td>
                <Td>{item.saldo}/{item.volumes}</Td>
                <Td>{fmtKg(item.pesoKg)}</Td>
                <Td>{fmtBRL(item.valorMercadoria)}</Td>
                <Td>{item.localizacao || "—"}</Td>
                <Td><PillDias dias={item.diasParados} /></Td>
                <Td><Acoes item={item} onBaixa={onBaixa} onDetalhe={onDetalhe} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
