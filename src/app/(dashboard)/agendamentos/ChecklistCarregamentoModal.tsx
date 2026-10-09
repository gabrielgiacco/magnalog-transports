"use client";
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button, Modal } from "@/components/ui";

type Opcao = { valor: string; rotulo: string; total: number };
type Opcoes = {
  cargas: number;
  fornecedores: Opcao[];
  motoristas: Opcao[];
  clientes: Opcao[];
  cidades: Opcao[];
};
type Chave = "fornecedor" | "motorista" | "cliente" | "cidade";

const SECOES: { chave: Chave; campo: keyof Omit<Opcoes, "cargas">; titulo: string }[] = [
  { chave: "fornecedor", campo: "fornecedores", titulo: "Fornecedor" },
  { chave: "motorista", campo: "motoristas", titulo: "Motorista" },
  { chave: "cliente", campo: "clientes", titulo: "Cliente" },
  { chave: "cidade", campo: "cidades", titulo: "Cidade" },
];

const SEM_SELECAO: Record<Chave, string[]> = { fornecedor: [], motorista: [], cliente: [], cidade: [] };

interface Props {
  open: boolean;
  onClose: () => void;
  dataInicial: string; // YYYY-MM-DD
}

export function ChecklistCarregamentoModal({ open, onClose, dataInicial }: Props) {
  const [data, setData] = useState(dataInicial);
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(false);
  const [sel, setSel] = useState<Record<Chave, string[]>>(SEM_SELECAO);

  // Ao abrir, volta para a data sugerida
  useEffect(() => {
    if (open) setData(dataInicial);
  }, [open, dataInicial]);

  // Recarrega as opções quando a data muda; limpa as seleções
  useEffect(() => {
    if (!open || !data) return;
    let cancelado = false;
    setLoading(true);
    setErro(false);
    setSel(SEM_SELECAO);
    fetch(`/api/agendamentos/checklist-opcoes?data=${data}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
      .then((j) => { if (!cancelado) setOpcoes(j); })
      .catch(() => { if (!cancelado) { setOpcoes(null); setErro(true); } })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [open, data]);

  const alternar = (chave: Chave, valor: string) =>
    setSel((s) => ({
      ...s,
      [chave]: s[chave].includes(valor) ? s[chave].filter((v) => v !== valor) : [...s[chave], valor],
    }));

  const gerar = () => {
    const qs = new URLSearchParams({ data });
    SECOES.forEach(({ chave }) => sel[chave].forEach((v) => qs.append(chave, v)));
    window.open("/imprimir/checklist-carregamento?" + qs.toString(), "_blank");
  };

  const semCargas = !!opcoes && opcoes.cargas === 0;

  return (
    <Modal open={open} onClose={onClose} title="Checklist de carregamento" size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {loading ? "Carregando..." : opcoes
              ? semCargas
                ? "Nenhuma carga agendada (que ainda não saiu) nesse dia."
                : `${opcoes.cargas} carga(s) a carregar nesse dia`
              : ""}
          </span>
        </div>

        {erro && <p className="text-sm text-red-500">Não foi possível carregar os filtros. Tente outra data.</p>}

        {opcoes && !semCargas && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SECOES.map(({ chave, campo, titulo }) => {
              const lista = opcoes[campo];
              if (lista.length <= 1) return null;
              return (
                <div key={chave} className="rounded-lg p-2" style={{ border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{titulo}</span>
                    {sel[chave].length > 0 && (
                      <button type="button" className="text-xs underline" style={{ color: "var(--text-muted)" }}
                        onClick={() => setSel((s) => ({ ...s, [chave]: [] }))}>
                        limpar
                      </button>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {lista.map((o) => (
                      <label key={o.valor} className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text)" }}>
                        <input type="checkbox" className="mt-0.5" checked={sel[chave].includes(o.valor)}
                          onChange={() => alternar(chave, o.valor)} />
                        <span className="min-w-0 break-words">{o.rotulo} ({o.total})</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Abre em nova aba — Imprimir › Salvar como PDF ou imprimir direto.
        </p>

        <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={gerar} disabled={loading || !opcoes || semCargas}>
            <Printer size={14} className="mr-1.5" /> Gerar checklist
          </Button>
        </div>
      </div>
    </Modal>
  );
}
