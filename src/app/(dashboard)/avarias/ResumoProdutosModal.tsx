"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button, Loading, Modal, StatusBadge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { calcularPrejuizo, linhaContaComoPrejuizo } from "@/lib/avaria-prejuizo";

const TIPO: Record<string, { label: string; cor: string }> = {
  AVARIA: { label: "Avaria", cor: "#ef4444" },
  FALTA: { label: "Falta", cor: "#f97316" },
  INVERSAO: { label: "Inversão", cor: "#8b5cf6" },
  SOBRA: { label: "Sobra", cor: "#3b82f6" },
  DEVOLUCAO: { label: "Devolução", cor: "#eab308" },
  SEM_PEDIDO: { label: "Sem pedido", cor: "#64748b" },
};

const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function Badge({ tipo }: { tipo: string }) {
  const t = TIPO[tipo] || { label: tipo, cor: "#64748b" };
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${t.cor}22`, color: t.cor }}>
      {t.label}
    </span>
  );
}

/** Resumo rapido dos produtos afetados, aberto pelo olho da lista de registros. */
export function ResumoProdutosModal({ avariaId, onClose }: { avariaId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [avaria, setAvaria] = useState<any | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!avariaId) return;
    setAvaria(null);
    setErro(false);
    fetch(`/api/avarias/${avariaId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setAvaria)
      .catch(() => setErro(true));
  }, [avariaId]);

  const produtos: any[] = avaria?.produtos || [];
  const devolucoes: any[] = avaria?.devolucoes || [];
  // Quantidade por tipo, para o resumo do topo
  const porTipo = produtos.reduce((m: Record<string, number>, p) => {
    const t = p.tipoDivergencia || avaria.tipo;
    m[t] = (m[t] || 0) + (p.quantidadeAvaria || 0);
    return m;
  }, {});
  const total = avaria ? calcularPrejuizo(avaria.tipo, produtos) : 0;

  return (
    <Modal open={!!avariaId} onClose={onClose} title={avaria ? `${avaria.codigo} — produtos afetados` : "Produtos afetados"} size="lg">
      {erro ? (
        <p className="text-sm text-red-500">Não foi possível carregar a avaria.</p>
      ) : !avaria ? (
        <Loading />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text2)" }}>
            <Badge tipo={avaria.tipo} />
            <StatusBadge status={avaria.status} />
            <span>{formatDate(avaria.dataOcorrencia)}</span>
            {avaria.entrega?.razaoSocial && <span className="truncate">· {avaria.entrega.razaoSocial}</span>}
            {avaria.transportadoraChegada && <span className="truncate">· {avaria.transportadoraChegada}</span>}
          </div>

          {produtos.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {Object.entries(porTipo).map(([t, q]) => (
                  <span key={t} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg" style={{ background: "var(--surface2)" }}>
                    <Badge tipo={t} /> <b>{num(q as number)}</b> un.
                  </span>
                ))}
              </div>

              <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--surface2)", color: "var(--text3)" }}>
                      <th className="text-left px-3 py-2 font-semibold">Produto</th>
                      <th className="text-left px-2 py-2 font-semibold">Tipo</th>
                      <th className="text-right px-2 py-2 font-semibold whitespace-nowrap">Qtd / NF</th>
                      <th className="text-right px-3 py-2 font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.map((p) => {
                      const tipo = p.tipoDivergencia || avaria.tipo;
                      const conta = linhaContaComoPrejuizo(p.tipoDivergencia, avaria.tipo);
                      return (
                        <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                          <td className="px-3 py-2">
                            <div className="font-medium" style={{ color: "var(--text)" }}>{p.descricao}</div>
                            <div className="font-mono text-[10px]" style={{ color: "var(--text3)" }}>
                              Cód. {p.codigoProduto}{p.notaFiscal?.numero ? ` · NF ${p.notaFiscal.numero}` : ""}
                            </div>
                            {tipo === "INVERSAO" && p.invertidoDescricao && (
                              <div className="text-[11px] mt-0.5" style={{ color: "#8b5cf6" }}>
                                ↳ veio no lugar: {p.invertidoDescricao}
                                {p.invertidoCodigo ? ` (cód. ${p.invertidoCodigo})` : ""}
                                {p.invertidoQuantidade != null ? ` — ${num(p.invertidoQuantidade)} un.` : ""}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2"><Badge tipo={tipo} /></td>
                          <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                            <b>{num(p.quantidadeAvaria || 0)}</b>
                            <span style={{ color: "var(--text3)" }}> / {num(p.quantidadeNF || 0)}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={{ color: conta ? "#ef4444" : "var(--text3)" }}>
                            {formatCurrency(p.valorTotal || 0)}
                            {!conta && <div className="text-[9px]">não conta</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center px-3 py-2 rounded-lg text-sm" style={{ background: "var(--surface2)" }}>
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text3)" }}>
                  {avaria.tipo === "DEVOLUCAO" ? "Valor devolvido" : "Prejuízo (falta + avaria)"}
                </span>
                <b className="font-mono text-red-500">{formatCurrency(total)}</b>
              </div>
            </>
          ) : devolucoes.length > 0 ? (
            <div className="space-y-1.5">
              {devolucoes.map((d) => (
                <div key={d.id} className="flex justify-between text-xs px-3 py-2 rounded-lg" style={{ background: "var(--surface2)" }}>
                  <span>NF {d.numero} · {d.emitenteRazao}</span>
                  <span className="font-mono">{formatCurrency(d.valorNota || 0)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--text3)" }}>Nenhum produto registrado nesta avaria.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={() => router.push(`/avarias/${avaria.id}`)}>
              <ExternalLink size={14} /> Abrir avaria completa
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
