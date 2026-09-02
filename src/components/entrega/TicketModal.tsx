"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Modal, Select, Textarea } from "@/components/ui";
import { Copy, Download, Mail, AlertTriangle } from "lucide-react";
import { abrirMailto, copiarRico } from "@/lib/clipboard";
import {
  ALIQUOTAS_PADRAO,
  calcularDescargaTicket,
  TIPO_TICKET_LABELS,
  type Aliquotas,
  type TipoTicket,
} from "@/lib/ticket-calc";
import {
  moeda,
  moedaTicket,
  renderTicketEmailHtml,
  renderTicketTablesHtml,
  renderTicketTablesTexto,
  type TicketBloco,
} from "@/lib/ticket-html";

type Sugestao = {
  tipo: TipoTicket;
  label: string;
  valor: number;
  observacoes: string;
  semTabela: boolean;
  detalhe: string;
  valorBase?: number;
};

type Defaults = {
  entregaId: string;
  embarcadores: { cnpj: string; nome: string }[];
  embarcadorCnpj: string;
  embarcadorNome: string;
  temTabela: boolean;
  aliquotas: Aliquotas;
  destinatarios: { para: string; copia: string; assunto: string; intro: string; assinatura: string };
  campos: Record<string, string>;
  sugestoes: Sugestao[];
};

type Selecionado = { marcado: boolean; valor: string; observacoes: string; valorBase: string };

const CAMPOS_EDITAVEIS: { key: string; label: string }[] = [
  { key: "dataSolicitacao", label: "Data solicitação" },
  { key: "cliente", label: "Cliente" },
  { key: "localidade", label: "Localidade" },
  { key: "notasFiscais", label: "Notas fiscais" },
  { key: "dataAgenda", label: "Data agenda" },
  { key: "cte", label: "Nº CTE" },
  { key: "perfilVeiculo", label: "Perfil do veículo" },
  { key: "placaVeiculo", label: "Placa do veículo" },
  { key: "volumes", label: "Volumes" },
];

function paraNumero(s: string): number {
  const n = parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function TicketModal({
  open,
  onClose,
  entregaId,
}: {
  open: boolean;
  onClose: () => void;
  entregaId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [embarcador, setEmbarcador] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [para, setPara] = useState("");
  const [copia, setCopia] = useState("");
  const [assunto, setAssunto] = useState("");
  const [sel, setSel] = useState<Record<string, Selecionado>>({});
  // Registro já gravado nesta sessão do modal, com a assinatura do conteúdo que
  // gerou ele — evita um TCK novo a cada clique de botão.
  const [criada, setCriada] = useState<{ id: string; numero: string; assinatura: string } | null>(null);

  const carregar = useCallback(
    async (cnpj?: string) => {
      setLoading(true);
      setCriada(null);
      try {
        const url = `/api/entregas/${entregaId}/ticket-preview${cnpj ? `?embarcador=${cnpj}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json()).error || "Erro ao carregar dados da entrega");
        const d: Defaults = await res.json();

        setDefaults(d);
        setEmbarcador(d.embarcadorCnpj);
        setCampos({ ...d.campos });
        setPara(d.destinatarios.para);
        setCopia(d.destinatarios.copia);
        setAssunto(d.destinatarios.assunto);
        setSel(
          Object.fromEntries(
            d.sugestoes.map((s) => [
              s.tipo,
              {
                marcado: false,
                valor: s.valor.toFixed(2).replace(".", ","),
                observacoes: s.observacoes,
                valorBase: (s.valorBase ?? 0).toFixed(2).replace(".", ","),
              },
            ]),
          ),
        );
      } catch (e: any) {
        toast.error(e.message || "Erro ao carregar dados");
      } finally {
        setLoading(false);
      }
    },
    [entregaId],
  );

  useEffect(() => {
    if (open) carregar();
  }, [open, carregar]);

  const aliquotas = defaults?.aliquotas || ALIQUOTAS_PADRAO;

  // Recalcula os impostos ao vivo conforme o usuário edita o valor base da descarga.
  const descargaBreakdown = useMemo(() => {
    const s = sel.DESCARGA;
    if (!s?.marcado) return null;
    return calcularDescargaTicket(paraNumero(s.valorBase), aliquotas);
  }, [sel.DESCARGA, aliquotas]);

  useEffect(() => {
    if (!descargaBreakdown) return;
    const novo = descargaBreakdown.total.toFixed(2).replace(".", ",");
    setSel((p) => (p.DESCARGA && p.DESCARGA.valor !== novo ? { ...p, DESCARGA: { ...p.DESCARGA, valor: novo } } : p));
  }, [descargaBreakdown]);

  const blocos: TicketBloco[] = useMemo(() => {
    if (!defaults) return [];
    return defaults.sugestoes
      .filter((s) => sel[s.tipo]?.marcado)
      .map((s) => ({
        linha: {
          dataSolicitacao: campos.dataSolicitacao || "",
          transportador: campos.transportador || "MAGNA LOG",
          cliente: campos.cliente || "",
          localidade: campos.localidade || "",
          notasFiscais: campos.notasFiscais || "",
          dataAgenda: campos.dataAgenda || "",
          cte: campos.cte || "",
          perfilVeiculo: campos.perfilVeiculo || "",
          placaVeiculo: campos.placaVeiculo || "",
          volumes: campos.volumes || "",
          tipoSolicitacao: TIPO_TICKET_LABELS[s.tipo],
          valor: moedaTicket(paraNumero(sel[s.tipo].valor)),
          observacoes: sel[s.tipo].observacoes,
        },
        descarga: s.tipo === "DESCARGA" ? descargaBreakdown || undefined : undefined,
      }));
  }, [defaults, sel, campos, descargaBreakdown]);

  const marcados = blocos.length;

  function trocarEmbarcador(cnpj: string) {
    setEmbarcador(cnpj);
    carregar(cnpj);
  }

  // Persiste antes de copiar/baixar, para o histórico guardar exatamente o que saiu.
  //
  // Grava UMA vez por documento, não uma por clique: copiar e depois baixar o
  // .eml do mesmo ticket reaproveita o registro. A assinatura cobre o corpo e o
  // cabeçalho — mexeu em qualquer campo, vira um ticket novo de verdade.
  async function persistir(corpoHtml: string): Promise<{ id: string; numero: string }> {
    const assinatura = JSON.stringify({ corpoHtml, para, copia, assunto });
    if (criada && criada.assinatura === assinatura) return criada;

    const itens = defaults!.sugestoes
      .filter((s) => sel[s.tipo]?.marcado)
      .map((s) => {
        const base: any = {
          tipo: s.tipo,
          valor: paraNumero(sel[s.tipo].valor),
          observacoes: sel[s.tipo].observacoes || null,
        };
        if (s.tipo === "DESCARGA" && descargaBreakdown) {
          base.valorBase = descargaBreakdown.base;
          base.valorIrpj = descargaBreakdown.irpj;
          base.valorCsll = descargaBreakdown.csll;
          base.valorCofins = descargaBreakdown.cofins;
          base.valorPis = descargaBreakdown.pis;
          base.valorIss = descargaBreakdown.iss;
        }
        return base;
      });

    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entregaId,
        embarcadorCnpj: embarcador,
        embarcadorNome: defaults!.embarcadorNome,
        ...campos,
        cteNumero: campos.cte,
        volumes: paraNumero(campos.volumes),
        dataAgenda: null,
        destinatarios: para,
        copia,
        assunto,
        corpoHtml,
        itens,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Erro ao salvar solicitação");

    const salva = await res.json();
    const nova = { id: salva.id, numero: salva.numero, assinatura };
    setCriada(nova);
    return nova;
  }

  async function handleCopiar(abrirEmail: boolean) {
    if (marcados === 0) return;
    // Montados ANTES de qualquer await: a Clipboard API exige o gesto do clique.
    const htmlFragmento = renderTicketTablesHtml(blocos);
    const htmlEmail = renderTicketEmailHtml(blocos, {
      intro: defaults?.destinatarios.intro,
      assinatura: defaults?.destinatarios.assinatura,
    });
    const texto = renderTicketTablesTexto(blocos);

    setSalvando(true);
    try {
      const resultado = await copiarRico(htmlFragmento, texto);
      const registro = await persistir(htmlEmail);

      if (resultado === "texto") {
        toast("Copiado como texto puro — o navegador bloqueou a cópia formatada", { icon: "⚠️" });
      } else {
        toast.success(`${registro.numero} — copiado, cole no e-mail com Ctrl+V`);
      }

      if (abrirEmail) abrirMailto({ para, copia, assunto });
    } catch (e: any) {
      toast.error(e.message || "Erro ao copiar");
    } finally {
      setSalvando(false);
    }
  }

  async function handleBaixarEml() {
    if (marcados === 0) return;
    setSalvando(true);
    try {
      const htmlEmail = renderTicketEmailHtml(blocos, {
        intro: defaults?.destinatarios.intro,
        assinatura: defaults?.destinatarios.assinatura,
      });
      const criada = await persistir(htmlEmail);

      const res = await fetch(`/api/tickets/${criada.id}/eml`);
      if (!res.ok) throw new Error("Erro ao gerar o arquivo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // O atributo download é obrigatório: sem ele o Chrome exibe o .eml como texto.
      a.download = `Ticket-${criada.numero}.eml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`${criada.numero} gerado`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao baixar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Solicitação de Aprovação de Ticket" size="xl">
      {loading || !defaults ? (
        <div className="py-16 text-center text-sm" style={{ color: "var(--text3)" }}>
          Carregando dados da entrega...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── Coluna esquerda: formulário ───────────────────────────── */}
          <div className="space-y-4">
            {/* Embarcador */}
            {defaults.embarcadores.length > 1 ? (
              <Select
                label="Embarcador (emitente da NF)"
                value={embarcador}
                onChange={(e) => trocarEmbarcador(e.target.value)}
              >
                {defaults.embarcadores.map((e) => (
                  <option key={e.cnpj} value={e.cnpj}>
                    {e.nome}
                  </option>
                ))}
              </Select>
            ) : (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: "var(--text3)" }}>
                  Embarcador (emitente da NF)
                </div>
                <div className="text-sm font-semibold">{defaults.embarcadorNome || "—"}</div>
              </div>
            )}

            {!defaults.temTabela && (
              <div
                className="p-3 rounded-xl flex items-start gap-2 text-xs"
                style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.3)", color: "var(--text2)" }}
              >
                <AlertTriangle size={15} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
                <span>
                  Este embarcador não tem tabela de valores cadastrada. Os valores vêm zerados — cadastre em{" "}
                  <strong>Configurações → Valores de Ticket</strong> ou preencha à mão abaixo.
                </span>
              </div>
            )}

            <Input label="Para" value={para} onChange={(e) => setPara(e.target.value)} placeholder="fulano@cliente.com, outro@cliente.com" />
            <Input label="Cópia" value={copia} onChange={(e) => setCopia(e.target.value)} placeholder="financeiro@magnalog.com.br" />
            <Input label="Assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} />

            <div className="grid grid-cols-2 gap-3">
              {CAMPOS_EDITAVEIS.map((c) => (
                <Input
                  key={c.key}
                  label={c.label}
                  value={campos[c.key] || ""}
                  onChange={(e) => setCampos((p) => ({ ...p, [c.key]: e.target.value }))}
                />
              ))}
            </div>

            {/* Tipos */}
            <div className="space-y-2 pt-1">
              <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text3)" }}>
                Tipos de solicitação
              </div>
              {defaults.sugestoes.map((s) => {
                const st = sel[s.tipo];
                if (!st) return null;
                return (
                  <div
                    key={s.tipo}
                    className="rounded-xl p-3"
                    style={{
                      background: st.marcado ? "rgba(249,115,22,.06)" : "var(--surface2)",
                      border: `1px solid ${st.marcado ? "rgba(249,115,22,.3)" : "var(--border)"}`,
                    }}
                  >
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={st.marcado}
                        onChange={(e) => setSel((p) => ({ ...p, [s.tipo]: { ...p[s.tipo], marcado: e.target.checked } }))}
                        className="accent-orange-500 w-4 h-4"
                      />
                      <span className="text-sm font-bold flex-1">{s.label}</span>
                      <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>
                        {s.detalhe}
                      </span>
                    </label>

                    {st.marcado && (
                      <div className="mt-3 space-y-2">
                        {s.semTabela && (
                          <div className="text-[11px] flex items-center gap-1.5" style={{ color: "#d97706" }}>
                            <AlertTriangle size={12} /> Sem valor cadastrado — confira antes de enviar.
                          </div>
                        )}

                        {s.tipo === "DESCARGA" ? (
                          <>
                            <Input
                              label="Valor da descarga (base, sem impostos)"
                              value={st.valorBase}
                              onChange={(e) => setSel((p) => ({ ...p, DESCARGA: { ...p.DESCARGA, valorBase: e.target.value } }))}
                              placeholder="0,00"
                            />
                            {descargaBreakdown && (
                              <div className="rounded-lg p-2 text-[11px] font-mono" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                                {[
                                  ["IRPJ", aliquotas.irpj, descargaBreakdown.irpj],
                                  ["CSLL", aliquotas.csll, descargaBreakdown.csll],
                                  ["COFINS", aliquotas.cofins, descargaBreakdown.cofins],
                                  ["PIS", aliquotas.pis, descargaBreakdown.pis],
                                  ["ISS", aliquotas.iss, descargaBreakdown.iss],
                                ].map(([nome, aliq, val]) => (
                                  <div key={String(nome)} className="flex justify-between" style={{ color: "var(--text2)" }}>
                                    <span>
                                      {nome} {Number(aliq).toFixed(2).replace(".", ",")}%
                                    </span>
                                    <span>{moeda(Number(val))}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between font-bold pt-1 mt-1" style={{ borderTop: "1px solid var(--border)" }}>
                                  <span>Total a pagar</span>
                                  <span style={{ color: "var(--accent)" }}>{moeda(descargaBreakdown.total)}</span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <Input
                            label="Valor (R$)"
                            value={st.valor}
                            onChange={(e) => setSel((p) => ({ ...p, [s.tipo]: { ...p[s.tipo], valor: e.target.value } }))}
                            placeholder="0,00"
                          />
                        )}

                        <Input
                          label="Observações"
                          value={st.observacoes}
                          onChange={(e) => setSel((p) => ({ ...p, [s.tipo]: { ...p[s.tipo], observacoes: e.target.value } }))}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Coluna direita: prévia ────────────────────────────────── */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--text3)" }}>
              Prévia do e-mail
            </div>
            <div
              className="rounded-xl p-4 overflow-auto"
              style={{ background: "#ffffff", border: "1px solid var(--border)", maxHeight: "60vh" }}
            >
              {marcados === 0 ? (
                <div className="text-center py-12 text-sm" style={{ color: "#888" }}>
                  Marque ao menos um tipo de solicitação.
                </div>
              ) : (
                // Seguro: este HTML é produzido inteiramente por renderTicketTablesHtml,
                // que aplica esc() em toda interpolação. Não trocar por conteúdo externo.
                <div dangerouslySetInnerHTML={{ __html: renderTicketTablesHtml(blocos) }} />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
        <Button variant="ghost" onClick={handleBaixarEml} disabled={marcados === 0 || salvando} title="Rascunho .eml (abre como rascunho só no Outlook clássico do Windows)">
          <Download size={14} /> Baixar .eml
        </Button>
        <Button variant="ghost" onClick={() => handleCopiar(false)} disabled={marcados === 0 || salvando}>
          <Copy size={14} /> Só copiar
        </Button>
        <Button onClick={() => handleCopiar(true)} disabled={marcados === 0 || salvando} loading={salvando}>
          <Mail size={14} /> Copiar e abrir e-mail
        </Button>
      </div>
    </Modal>
  );
}
