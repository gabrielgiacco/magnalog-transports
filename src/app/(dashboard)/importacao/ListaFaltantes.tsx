"use client";
import { Button, Card, Table, Th, Td, Tr } from "@/components/ui";
import { formatarCnpj } from "@/lib/chave-nfe";
import { Download, Loader2 } from "lucide-react";

/** Um item "faltando no TMS" — só o que a própria chave de acesso carrega. */
export type FaltanteItem = {
  chave: string;
  numero: string;
  serie: string;
  anoMes: string;
  uf: string;
  emitenteCnpj: string;
  emitenteRazao: string | null;
  embarcadorConhecido: boolean;
};

interface ListaFaltantesProps {
  itens: FaltanteItem[];
  selecionadas: Set<string>;
  onToggle: (chave: string) => void;
  onMarcarTodas: () => void;
  onLimpar: () => void;
  onBaixar: () => void;
  baixando: boolean;
}

const TITULO_BADGE =
  "Este CNPJ está cadastrado como embarcador no sistema. Não indica se esta nota é frete ou compra — isso só se sabe após baixar.";

function BadgeEmbarcador() {
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ background: "rgba(16,185,129,.15)", color: "#10b981" }}
      title={TITULO_BADGE}
    >
      embarcador cadastrado
    </span>
  );
}

function Emitente({ item }: { item: FaltanteItem }) {
  return (
    <>
      <div className="truncate max-w-[220px]" title={item.emitenteRazao || undefined}>{item.emitenteRazao || "—"}</div>
      <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{formatarCnpj(item.emitenteCnpj)}</div>
    </>
  );
}

/**
 * Lista "Faltando no TMS" da sincronização: mostra só o que a chave de
 * acesso carrega de graça (NF, emitente, UF, emissão) — sem inventar o
 * destinatário, que só existe depois do download do XML.
 */
export function ListaFaltantes({ itens, selecionadas, onToggle, onMarcarTodas, onLimpar, onBaixar, baixando }: ListaFaltantesProps) {
  if (itens.length === 0) return null;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono uppercase tracking-widest font-bold" style={{ color: "var(--text3)" }}>
            Faltando no TMS ({itens.length})
          </span>
          <button onClick={onMarcarTodas} className="text-[11px] hover:opacity-70" style={{ color: "var(--accent)" }}>
            Marcar todas
          </button>
          <button onClick={onLimpar} className="text-[11px] hover:opacity-70" style={{ color: "var(--text3)" }}>
            Limpar
          </button>
        </div>
        <Button size="sm" onClick={onBaixar} disabled={baixando || selecionadas.size === 0}>
          {baixando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Baixar e classificar {selecionadas.size > 0 ? `(${selecionadas.size})` : ""}
        </Button>
      </div>

      <div className="px-4 py-2 text-[11px]" style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
        Estes dados vêm da própria chave de acesso. O destinatário só aparece depois de baixar e classificar.
      </div>

      <div className="max-h-[50vh] overflow-y-auto">
        {/* Mobile: cards */}
        <div className="block md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
          {itens.map((item) => (
            <div key={item.chave} className="p-3 flex items-start gap-3">
              <input
                type="checkbox"
                checked={selecionadas.has(item.chave)}
                onChange={() => onToggle(item.chave)}
                className="accent-orange-500 flex-shrink-0 mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">NF {item.numero}{item.serie ? `/${item.serie}` : ""}</span>
                  <span className="text-[11px]" style={{ color: "var(--text3)" }}>{item.uf} · {item.anoMes}</span>
                </div>
                <Emitente item={item} />
                {item.embarcadorConhecido && <div className="mt-1"><BadgeEmbarcador /></div>}
                <div className="text-[10px] font-mono truncate mt-1" style={{ color: "var(--text3)" }} title={item.chave}>
                  {item.chave}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: tabela */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <thead>
              <Tr>
                <Th></Th>
                <Th>NF</Th>
                <Th>Emitente</Th>
                <Th>UF</Th>
                <Th>Emissão</Th>
                <Th>Chave</Th>
              </Tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <Tr key={item.chave}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={selecionadas.has(item.chave)}
                      onChange={() => onToggle(item.chave)}
                      className="accent-orange-500"
                    />
                  </Td>
                  <Td className="whitespace-nowrap">NF {item.numero}{item.serie ? `/${item.serie}` : ""}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div><Emitente item={item} /></div>
                      {item.embarcadorConhecido && <BadgeEmbarcador />}
                    </div>
                  </Td>
                  <Td>{item.uf || "—"}</Td>
                  <Td className="whitespace-nowrap">{item.anoMes || "—"}</Td>
                  <Td>
                    <span
                      className="text-[10px] font-mono truncate inline-block max-w-[140px] align-middle"
                      style={{ color: "var(--text3)" }}
                      title={item.chave}
                    >
                      {item.chave}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </Card>
  );
}
