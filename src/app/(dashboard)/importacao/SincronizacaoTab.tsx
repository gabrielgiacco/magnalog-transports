"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Empty } from "@/components/ui";
import { RefreshCw, Loader2, Download, CheckCircle2, AlertTriangle, DownloadCloud } from "lucide-react";

type Tipo = "NFE" | "CTE";

interface ChaveItem {
  chave: string;
  existe: boolean;
}

interface Progresso {
  paginaAtual: number;
  totalPaginas: number;
  totalDocumentos: number;
}

// Downloads de XML já armazenado são gratuitos, mas ainda são requisições HTTP.
// A doc do Meu Danfe pede cadência baixa; 3 em paralelo é o mesmo que o lote de
// consulta já usa e vem funcionando.
const CONCURRENCY = 3;

export function SincronizacaoTab() {
  const [tipo, setTipo] = useState<Tipo>("NFE");
  const [varrendo, setVarrendo] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [faltando, setFaltando] = useState<ChaveItem[]>([]);
  const [jaTemos, setJaTemos] = useState(0);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; erro: number } | null>(null);

  async function varrer() {
    setVarrendo(true);
    setFaltando([]);
    setJaTemos(0);
    setSelecionadas(new Set());
    setResultado(null);

    const ausentes: ChaveItem[] = [];
    let presentes = 0;
    let pagina = 1;
    let totalPaginas = 1;

    try {
      while (pagina <= totalPaginas) {
        const res = await fetch(`/api/sincronizacao?tipo=${tipo}&pagina=${pagina}`);
        if (!res.ok) throw new Error((await res.json()).error || "Erro ao listar");
        const d = await res.json();

        totalPaginas = d.totalPaginas || 0;
        setProgresso({ paginaAtual: pagina, totalPaginas, totalDocumentos: d.totalDocumentos || 0 });

        for (const item of d.chaves as ChaveItem[]) {
          if (item.existe) presentes++;
          else ausentes.push(item);
        }

        setFaltando([...ausentes]);
        setJaTemos(presentes);

        if (totalPaginas === 0) break;
        pagina++;
      }

      setSelecionadas(new Set(ausentes.map((a) => a.chave)));
      toast.success(
        ausentes.length === 0
          ? "Tudo em dia — nada faltando no TMS."
          : `${ausentes.length} documento(s) existem no Meu Danfe e não estão aqui.`
      );
    } catch (e: any) {
      toast.error(e.message || "Erro na varredura");
    } finally {
      setVarrendo(false);
    }
  }

  function alternar(chave: string) {
    setSelecionadas((prev) => {
      const s = new Set(prev);
      if (s.has(chave)) s.delete(chave); else s.add(chave);
      return s;
    });
  }

  async function importar() {
    const alvo = faltando.filter((f) => selecionadas.has(f.chave));
    if (alvo.length === 0) { toast.error("Selecione ao menos um documento"); return; }

    setImportando(true);
    let ok = 0;
    let erro = 0;

    try {
      // 1) Baixa os XMLs (grátis) com concorrência controlada
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
            erro++;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, alvo.length) }, () => worker()));

      // 2) Entrega ao importador que já existe — ele cuida de duplicata,
      //    agrupamento em entrega, geocode e indexação de produtos.
      if (xmls.length > 0) {
        const fd = new FormData();
        for (const x of xmls) {
          fd.append("files", new Blob([x.xml], { type: "text/xml" }), `${x.chave}.xml`);
        }
        const res = await fetch("/api/importacao", { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json()).error || "Erro na importação");
        const d = await res.json();
        ok = (d.importadas || 0) + (d.ctesImportados || 0);
        erro += (d.erros?.length || 0);
      }

      setResultado({ ok, erro });
      toast.success(`${ok} documento(s) importado(s).`);

      // Some da lista o que entrou
      const importadas = new Set(xmls.map((x) => x.chave));
      setFaltando((prev) => prev.filter((f) => !importadas.has(f.chave)));
      setSelecionadas(new Set());
    } catch (e: any) {
      toast.error(e.message || "Erro ao importar");
    } finally {
      setImportando(false);
    }
  }

  const pctVarredura = progresso && progresso.totalPaginas > 0
    ? Math.round((progresso.paginaAtual / progresso.totalPaginas) * 100)
    : 0;

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
            <Button onClick={varrer} disabled={varrendo || importando}>
              {varrendo ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {varrendo ? "Varrendo..." : "Verificar"}
            </Button>
          </div>
        </div>
      </Card>

      {progresso && (
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span style={{ color: "var(--text2)" }}>
              Página {progresso.paginaAtual} de {progresso.totalPaginas} · {progresso.totalDocumentos} documento(s) na sua conta
            </span>
            <span className="font-mono" style={{ color: "var(--text3)" }}>{pctVarredura}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
            <div className="h-full transition-all" style={{ width: `${pctVarredura}%`, background: "var(--accent)" }} />
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs">
            <span className="flex items-center gap-1" style={{ color: "#10b981" }}>
              <CheckCircle2 size={13} /> {jaTemos} já no TMS
            </span>
            <span className="flex items-center gap-1" style={{ color: "#f59e0b" }}>
              <AlertTriangle size={13} /> {faltando.length} faltando aqui
            </span>
          </div>
        </Card>
      )}

      {resultado && (
        <Card className="p-3">
          <div className="text-xs" style={{ color: "var(--text2)" }}>
            Importação concluída: <b>{resultado.ok}</b> documento(s) entraram
            {resultado.erro > 0 && <> · <span className="text-rose-500">{resultado.erro} falharam</span></>}
          </div>
        </Card>
      )}

      {faltando.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono uppercase tracking-widest font-bold" style={{ color: "var(--text3)" }}>
                Faltando no TMS ({faltando.length})
              </span>
              <button
                onClick={() => setSelecionadas(new Set(faltando.map((f) => f.chave)))}
                className="text-[11px] hover:opacity-70"
                style={{ color: "var(--accent)" }}
              >
                Marcar todas
              </button>
              <button
                onClick={() => setSelecionadas(new Set())}
                className="text-[11px] hover:opacity-70"
                style={{ color: "var(--text3)" }}
              >
                Limpar
              </button>
            </div>
            <Button size="sm" onClick={importar} disabled={importando || selecionadas.size === 0}>
              {importando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Importar {selecionadas.size > 0 ? `(${selecionadas.size})` : ""}
            </Button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto">
            {faltando.map((f, i) => (
              <button
                key={f.chave}
                type="button"
                onClick={() => alternar(f.chave)}
                className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                style={{
                  borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  background: selecionadas.has(f.chave) ? "rgba(249,115,22,.08)" : "transparent",
                }}
              >
                <input type="checkbox" readOnly checked={selecionadas.has(f.chave)} className="accent-orange-500" />
                <span className="font-mono text-[11px] break-all" style={{ color: "var(--text2)" }}>{f.chave}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {progresso && !varrendo && faltando.length === 0 && (
        <Empty icon="✅" text="Nada faltando — o TMS já tem tudo que está na sua Área do Cliente." />
      )}
    </div>
  );
}
