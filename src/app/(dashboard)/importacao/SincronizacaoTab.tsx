"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Empty } from "@/components/ui";
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, DownloadCloud, Truck, Receipt } from "lucide-react";
import { ListaClassificada, type NfClassificada, type TipoContaPagar } from "./ListaClassificada";
import { ListaFaltantes, type FaltanteItem } from "./ListaFaltantes";

type Tipo = "NFE" | "CTE";
type ChaveItem = FaltanteItem & { existe: boolean };
type Progresso = { blocos: number; chavesVistas: number };
type Marcador = { ultimaChave: string | null; ultimaVarreduraEm: string | null; ultimoBlocoEm: string | null };

// Downloads de XML já armazenado são gratuitos, mas ainda são requisições HTTP.
// A doc do Meu Danfe pede cadência baixa; 3 em paralelo é o mesmo do lote de consulta.
const CONCURRENCY = 3;

// Trava de segurança: 200 blocos x 50 chaves = 10.000 chaves por acionamento.
// Nunca deve ser atingido em uso normal — só existe pra um bug não girar pra sempre.
const LIMITE_BLOCOS = 200;

export function SincronizacaoTab() {
  const [tipo, setTipo] = useState<Tipo>("NFE");
  const [varrendo, setVarrendo] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [marcador, setMarcador] = useState<Marcador | null>(null);
  const [faltando, setFaltando] = useState<FaltanteItem[]>([]);
  const [jaTemos, setJaTemos] = useState(0);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [classificando, setClassificando] = useState(false);
  const [xmlsPorChave, setXmlsPorChave] = useState<Map<string, string>>(new Map());
  const [freteItens, setFreteItens] = useState<NfClassificada[]>([]);
  const [compraItens, setCompraItens] = useState<NfClassificada[]>([]);
  const [freteSelecionadas, setFreteSelecionadas] = useState<Set<string>>(new Set());
  const [compraSelecionadas, setCompraSelecionadas] = useState<Set<string>>(new Set());
  const [tiposCompra, setTiposCompra] = useState<Map<string, TipoContaPagar>>(new Map());
  const [importandoFrete, setImportandoFrete] = useState(false);
  const [importandoCompras, setImportandoCompras] = useState(false);
  const [resultadoFrete, setResultadoFrete] = useState<{ ok: number; erro: number } | null>(null);
  const [resultadoCompras, setResultadoCompras] = useState<{ criadas: number; ignoradas: number } | null>(null);

  async function sincronizar(recomecar: boolean) {
    if (recomecar) {
      const confirmou = window.confirm(
        "A varredura completa reinicia a listagem do zero, ignorando o ponto onde parou. Só é permitida 1 vez por hora para cada tipo de documento. Continuar?"
      );
      if (!confirmou) return;
    }

    setVarrendo(true);
    setFaltando([]);
    setJaTemos(0);
    setSelecionadas(new Set());
    setProgresso(null);

    const ausentes: ChaveItem[] = [];
    let presentes = 0;
    let blocos = 0;

    try {
      let fim = false;
      let primeiraChamada = true;

      while (!fim && blocos < LIMITE_BLOCOS) {
        const params = new URLSearchParams({ tipo });
        if (recomecar && primeiraChamada) params.set("recomecar", "1");
        primeiraChamada = false;

        const res = await fetch(`/api/sincronizacao?${params}`);
        const d = await res.json();

        if (!res.ok) {
          if (res.status === 429) toast.error(d.error || "Recomeço da listagem bloqueado. Aguarde o horário informado.");
          else if (res.status === 409) toast.error(d.error || "O marcador salvo não é mais válido — faça uma varredura completa.");
          else toast.error(d.error || "Erro ao listar");
          return;
        }

        blocos++;
        setProgresso({ blocos, chavesVistas: d.chavesVistas || 0 });
        setMarcador(d.marcador || null);

        for (const item of d.chaves as ChaveItem[]) {
          if (item.existe) presentes++; else ausentes.push(item);
        }

        setFaltando([...ausentes]);
        setJaTemos(presentes);
        fim = !!d.fim;
      }

      setSelecionadas(new Set(ausentes.map((a) => a.chave)));
      toast.success(
        ausentes.length === 0
          ? "Tudo em dia — nada faltando no TMS."
          : `${ausentes.length} documento(s) existem no Meu Danfe e não estão aqui.`
      );
    } catch (e: any) {
      toast.error(e.message || "Erro na sincronização");
    } finally {
      setVarrendo(false);
    }
  }

  // Reaproveitado pelas três seções — cada uma guarda sua seleção num Set próprio.
  function toggle(setter: typeof setSelecionadas, chave: string) {
    setter((prev) => {
      const s = new Set(prev);
      if (s.has(chave)) s.delete(chave); else s.add(chave);
      return s;
    });
  }

  // Baixa os XMLs (grátis) e classifica em FRETE ou COMPRA — sem gravar nada
  // ainda. Zero chamadas extras ao provedor: o XML já seria baixado de qualquer jeito.
  async function classificar() {
    const alvo = faltando.filter((f) => selecionadas.has(f.chave));
    if (alvo.length === 0) { toast.error("Selecione ao menos um documento"); return; }

    setClassificando(true);
    setResultadoFrete(null);
    setResultadoCompras(null);
    let errosDownload = 0;

    try {
      const xmls: { chave: string; xml: string }[] = [];
      let idx = 0;
      const worker = async () => {
        while (idx < alvo.length) {
          const meu = idx++;
          try {
            const r = await fetch("/api/sincronizacao/xml", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chave: alvo[meu].chave }),
            });
            if (!r.ok) throw new Error();
            const d = await r.json();
            xmls.push({ chave: d.chave, xml: d.xml });
          } catch {
            errosDownload++;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, alvo.length) }, () => worker()));

      if (xmls.length === 0) { toast.error("Não foi possível baixar nenhum XML."); return; }

      const res = await fetch("/api/sincronizacao/classificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentos: xmls }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || "Erro ao classificar"); return; }

      const frete: NfClassificada[] = d.frete || [];
      const compras: NfClassificada[] = d.compras || [];

      setXmlsPorChave(new Map(xmls.map((x) => [x.chave, x.xml])));
      setFreteItens(frete);
      setCompraItens(compras);
      setFreteSelecionadas(new Set());
      setCompraSelecionadas(new Set());
      setTiposCompra(new Map(compras.map((c) => [c.chave, c.tipoSugerido])));

      const naoClassificados = (d.invalidos?.length || 0) + errosDownload;
      toast.success(
        `${frete.length} de frete, ${compras.length} de compra/despesa` +
          (naoClassificados > 0 ? ` · ${naoClassificados} não puderam ser lidos` : "")
      );

      const processadas = new Set(xmls.map((x) => x.chave));
      setFaltando((prev) => prev.filter((f) => !processadas.has(f.chave)));
      setSelecionadas(new Set());
    } catch (e: any) {
      toast.error(e.message || "Erro ao classificar");
    } finally {
      setClassificando(false);
    }
  }

  async function importarFrete() {
    const alvo = freteItens.filter((f) => freteSelecionadas.has(f.chave) && !f.jaExiste);
    if (alvo.length === 0) { toast.error("Selecione ao menos um documento"); return; }

    setImportandoFrete(true);
    try {
      const fd = new FormData();
      for (const item of alvo) {
        const xml = xmlsPorChave.get(item.chave);
        if (xml) fd.append("files", new Blob([xml], { type: "text/xml" }), `${item.chave}.xml`);
      }
      const res = await fetch("/api/importacao", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Erro na importação");
      const d = await res.json();
      const ok = (d.importadas || 0) + (d.ctesImportados || 0);
      setResultadoFrete({ ok, erro: d.erros?.length || 0 });
      toast.success(`${ok} documento(s) de frete importado(s).`);

      const importadas = new Set(alvo.map((a) => a.chave));
      setFreteItens((prev) => prev.filter((f) => !importadas.has(f.chave)));
      setFreteSelecionadas(new Set());
    } catch (e: any) {
      toast.error(e.message || "Erro ao importar frete");
    } finally {
      setImportandoFrete(false);
    }
  }

  async function importarCompras() {
    const alvo = compraItens.filter((c) => compraSelecionadas.has(c.chave) && !c.jaExiste);
    if (alvo.length === 0) { toast.error("Selecione ao menos um documento"); return; }

    setImportandoCompras(true);
    try {
      const itens = alvo.map((c) => ({
        chave: c.chave,
        tipo: tiposCompra.get(c.chave) || c.tipoSugerido,
        descricao: `NF ${c.numero} — ${c.emitenteRazao}`,
        valor: c.valorTotal,
        dataVencimento: c.dataEmissao || new Date().toISOString(),
        favorecido: c.emitenteRazao,
      }));

      const res = await fetch("/api/sincronizacao/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao lançar compras");
      const d = await res.json();
      setResultadoCompras({ criadas: d.criadas || 0, ignoradas: d.ignoradas || 0 });
      toast.success(`${d.criadas || 0} conta(s) a pagar criada(s).`);

      const criadas = new Set(alvo.map((a) => a.chave));
      setCompraItens((prev) => prev.filter((c) => !criadas.has(c.chave)));
      setCompraSelecionadas(new Set());
    } catch (e: any) {
      toast.error(e.message || "Erro ao lançar compras");
    } finally {
      setImportandoCompras(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-start gap-3">
            <DownloadCloud size={20} className="text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold">Sincronizar com o Meu Danfe</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text2)" }}>
                Compara os documentos da sua Área do Cliente com os que estão no TMS e traz o que
                estiver faltando aqui. A listagem e o download do XML são gratuitos — esta tela
                nunca dispara busca cobrada na Receita.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Tipo)}
              disabled={varrendo}
              className="text-xs px-2 py-2 rounded-lg outline-none"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="NFE">NF-e</option>
              <option value="CTE">CT-e</option>
            </select>
            <Button variant="ghost" onClick={() => sincronizar(true)} disabled={varrendo || classificando}>
              Varredura completa
            </Button>
            <Button onClick={() => sincronizar(false)} disabled={varrendo || classificando}>
              {varrendo ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {varrendo ? "Sincronizando..." : "Sincronizar"}
            </Button>
          </div>
        </div>
        {marcador?.ultimoBlocoEm && (
          <div className="text-[11px] mt-2" style={{ color: "var(--text3)" }}>
            Última sincronização: {new Date(marcador.ultimoBlocoEm).toLocaleString("pt-BR")}
          </div>
        )}
      </Card>

      {progresso && (
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span style={{ color: "var(--text2)" }}>
              {progresso.blocos} bloco{progresso.blocos === 1 ? "" : "s"} · {progresso.chavesVistas} chave(s) vistas
            </span>
            {varrendo && <span style={{ color: "var(--text3)" }}>buscando...</span>}
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
            <div className={varrendo ? "h-full w-full animate-pulse" : "h-full w-full"} style={{ background: "var(--accent)" }} />
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs">
            <span className="flex items-center gap-1" style={{ color: "#10b981" }}><CheckCircle2 size={13} /> {jaTemos} já no TMS</span>
            <span className="flex items-center gap-1" style={{ color: "#f59e0b" }}><AlertTriangle size={13} /> {faltando.length} faltando aqui</span>
          </div>
        </Card>
      )}

      <ListaFaltantes
        itens={faltando} selecionadas={selecionadas} onToggle={(chave) => toggle(setSelecionadas, chave)}
        onMarcarTodas={() => setSelecionadas(new Set(faltando.map((f) => f.chave)))} onLimpar={() => setSelecionadas(new Set())}
        onBaixar={classificar} baixando={classificando}
      />

      {(freteItens.length > 0 || compraItens.length > 0) && (
        <div className="text-xs px-1" style={{ color: "var(--text2)" }}>
          Nota em que a Magna Log é a destinatária é compra, não frete — ela vai para Contas a Pagar.
        </div>
      )}

      {(resultadoFrete || resultadoCompras) && (
        <Card className="p-3 text-xs space-y-1" style={{ color: "var(--text2)" }}>
          {resultadoFrete && <div>Frete: <b>{resultadoFrete.ok}</b> importado(s) em Entregas{resultadoFrete.erro > 0 && ` · ${resultadoFrete.erro} falharam`}</div>}
          {resultadoCompras && <div>Compras/despesas: <b>{resultadoCompras.criadas}</b> conta(s) criada(s){resultadoCompras.ignoradas > 0 && ` · ${resultadoCompras.ignoradas} já existente(s)`}</div>}
        </Card>
      )}

      <ListaClassificada
        titulo="Frete — vai para Entregas" modo="frete" itens={freteItens}
        selecionadas={freteSelecionadas} onAlternar={(chave) => toggle(setFreteSelecionadas, chave)}
        onMarcarTodas={() => setFreteSelecionadas(new Set(freteItens.filter((f) => !f.jaExiste).map((f) => f.chave)))} onLimpar={() => setFreteSelecionadas(new Set())}
        acaoLabel="Importar" acaoIcon={<Truck size={13} />} onAcao={importarFrete} acaoCarregando={importandoFrete}
      />

      <ListaClassificada
        titulo="Compras e despesas — vai para Contas a Pagar" modo="compra" itens={compraItens}
        selecionadas={compraSelecionadas} onAlternar={(chave) => toggle(setCompraSelecionadas, chave)}
        onMarcarTodas={() => setCompraSelecionadas(new Set(compraItens.filter((c) => !c.jaExiste).map((c) => c.chave)))} onLimpar={() => setCompraSelecionadas(new Set())}
        acaoLabel="Lançar em Contas a Pagar" acaoIcon={<Receipt size={13} />} onAcao={importarCompras} acaoCarregando={importandoCompras}
        tiposCompra={tiposCompra} onAlterarTipo={(chave, t) => setTiposCompra((prev) => new Map(prev).set(chave, t))}
        nota="Vencimento definido como a data de emissão da nota — pode ser editado depois em Financeiro. O tipo sugerido é um palpite pelo nome do fornecedor; troque se estiver errado."
      />

      {progresso && !varrendo && faltando.length === 0 && freteItens.length === 0 && compraItens.length === 0 && (
        <Empty icon="✅" text="Nada faltando — o TMS já tem tudo que está na sua Área do Cliente." />
      )}
    </div>
  );
}
