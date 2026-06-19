"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card, Button, Input, Select, Modal, Table, Th, Td, Tr, Empty, Loading, Textarea } from "@/components/ui";
import toast from "react-hot-toast";
import { Search, Plus, Trash2, Edit2, FileSpreadsheet, Save, X, RefreshCw, Info, ChevronDown } from "lucide-react";

interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

function ComboboxPesquisa({
  label,
  options,
  value,
  onChange,
  onManual,
  placeholder = "Selecionar...",
  searchPlaceholder = "Buscar...",
  manualLabel = "+ Digitar Manualmente..."
}: {
  label: string;
  options: ComboboxOption[];
  value: string;
  onChange: (val: string) => void;
  onManual?: () => void;
  placeholder?: string;
  searchPlaceholder?: string;
  manualLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((o) => o.value === value);
  const filtered = options.filter(
    (o) => 
      o.label.toLowerCase().includes(search.toLowerCase()) || 
      (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase()))
  );

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearch("");
  };

  return (
    <div className="flex flex-col gap-1.5 w-full relative">
      <label className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>{label}</label>
      <div 
        className="w-full px-3 py-2 rounded-lg text-sm border cursor-text transition-all flex items-center justify-between gap-1"
        style={{ 
          background: "var(--surface2)", 
          borderColor: open ? "var(--accent)" : "var(--border)", 
          color: "var(--text)", 
          fontFamily: "'Inter', sans-serif",
          minHeight: "38px"
        }}
        onClick={() => setOpen(true)}
      >
        {open ? (
          <input
            autoFocus
            className="bg-transparent outline-none w-full"
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            placeholder={searchPlaceholder}
          />
        ) : (
          <span className={selected ? "text-slate-200 font-semibold truncate" : "opacity-50 truncate"}>
            {selected ? `${selected.label} ${selected.sublabel ? `(${selected.sublabel})` : ""}` : placeholder}
          </span>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {selected && !open && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-slate-700/30 transition-colors"
              title="Limpar"
            >
              <X size={14} className="text-red-400" />
            </button>
          )}
          <ChevronDown size={14} style={{ color: "var(--text3)" }} />
        </div>
      </div>

      {open && (
        <div className="absolute top-[100%] left-0 right-0 mt-1 rounded-lg shadow-lg border z-50 overflow-hidden max-h-48 overflow-y-auto"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          
          {onManual && (
            <div
              className="flex items-center gap-2 p-3 text-xs hover:bg-slate-800/50 cursor-pointer transition-colors text-[var(--accent)] font-bold uppercase tracking-wider"
              style={{ borderBottom: "1px solid var(--border)" }}
              onMouseDown={(e) => {
                e.preventDefault();
                onManual();
                setOpen(false);
                setSearch("");
              }}
            >
              <span>{manualLabel}</span>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-center opacity-50">Nenhum resultado encontrado</div>
          ) : (
            filtered.map((o) => (
              <div key={o.value}
                className="flex flex-col p-3 text-xs hover:bg-slate-800/50 cursor-pointer transition-colors"
                style={{ borderBottom: "1px solid var(--border)" }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o.value);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span className="font-semibold text-slate-200 truncate">{o.label}</span>
                {o.sublabel && (
                  <span className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{o.sublabel}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function formatCnpj(v: string) {
  const clean = v.replace(/\D/g, "");
  if (clean.length <= 11) return clean;
  return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

interface Norma {
  id: string;
  clienteCnpj: string;
  fornecedorCnpj: string;
  codigoProduto: string;
  descricao: string | null;
  embalagem: string | null;
  lastro: number;
  altura: number;
  quantidadeCaixasPalete: number;
}

interface OptionItem {
  cnpj: string;
  razaoSocial: string;
}

export default function NormasPaletizacaoPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const searchParams = useSearchParams();

  const [normas, setNormas] = useState<Norma[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<{ clientes: OptionItem[]; fornecedores: OptionItem[] }>({
    clientes: [],
    fornecedores: [],
  });

  const clientOptions = options.clientes.map((c) => ({
    value: c.cnpj,
    label: c.razaoSocial,
    sublabel: formatCnpj(c.cnpj),
  }));

  const supplierOptions = options.fornecedores.map((f) => ({
    value: f.cnpj,
    label: f.razaoSocial,
    sublabel: formatCnpj(f.cnpj),
  }));

  // Modais
  const [modalIndividualOpen, setModalIndividualOpen] = useState(false);
  const [modalImportOpen, setModalImportOpen] = useState(false);

  // Form Individual
  const [normaId, setNormaId] = useState<string | null>(null); // Se definido, é edição
  const [clienteCnpjSel, setClienteCnpjSel] = useState("");
  const [clienteNomeManual, setClienteNomeManual] = useState("");
  const [clienteCnpjManual, setClienteCnpjManual] = useState("");
  const [isClienteManual, setIsClienteManual] = useState(false);

  const [fornecedorCnpjSel, setFornecedorCnpjSel] = useState("");
  const [fornecedorNomeManual, setFornecedorNomeManual] = useState("");
  const [fornecedorCnpjManual, setFornecedorCnpjManual] = useState("");
  const [isFornecedorManual, setIsFornecedorManual] = useState(false);

  const [codigoProduto, setCodigoProduto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [embalagem, setEmbalagem] = useState("");
  const [lastro, setLastro] = useState(0);
  const [altura, setAltura] = useState(0);
  const [totalPalete, setTotalPalete] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form Importação Lote
  const [importClienteCnpjSel, setImportClienteCnpjSel] = useState("");
  const [importClienteNomeManual, setImportClienteNomeManual] = useState("");
  const [importClienteCnpjManual, setImportClienteCnpjManual] = useState("");
  const [isImportClienteManual, setIsImportClienteManual] = useState(false);

  const [importFornecedorCnpjSel, setImportFornecedorCnpjSel] = useState("");
  const [importFornecedorNomeManual, setImportFornecedorNomeManual] = useState("");
  const [importFornecedorCnpjManual, setImportFornecedorCnpjManual] = useState("");
  const [isImportFornecedorManual, setIsImportFornecedorManual] = useState(false);

  const [excelText, setExcelText] = useState("");
  const [importPreview, setImportPreview] = useState<any[]>([]);

  // Atualizar total palete ao mudar lastro ou altura
  useEffect(() => {
    setTotalPalete(lastro * altura);
  }, [lastro, altura]);

  const fetchNormas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/normas-paletizacao?q=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setNormas(data.normas || []);
      }
    } catch {
      toast.error("Erro ao carregar normas");
    } finally {
      setLoading(false);
    }
  }, [search]);

  const fetchOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/normas-paletizacao/options");
      if (res.ok) {
        const data = await res.json();
        setOptions(data);
      }
    } catch {
      console.error("Erro ao carregar opções");
    }
  }, []);

  useEffect(() => {
    fetchNormas();
  }, [fetchNormas]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    const addManual = searchParams.get("addManual");
    const cliCnpj = searchParams.get("clienteCnpj");
    const fornCnpj = searchParams.get("fornecedorCnpj");
    const codProd = searchParams.get("codigoProduto");
    const descProd = searchParams.get("descricao");

    if (addManual === "true" && cliCnpj && fornCnpj && codProd) {
      setCodigoProduto(codProd);
      setDescricao(descProd || "");
      
      const cliExists = options.clientes.some((c) => c.cnpj === cliCnpj);
      if (cliExists) {
        setClienteCnpjSel(cliCnpj);
        setIsClienteManual(false);
      } else {
        setClienteCnpjSel("MANUAL");
        setClienteCnpjManual(cliCnpj);
        setIsClienteManual(true);
      }

      const fornExists = options.fornecedores.some((f) => f.cnpj === fornCnpj);
      if (fornExists) {
        setFornecedorCnpjSel(fornCnpj);
        setIsFornecedorManual(false);
      } else {
        setFornecedorCnpjSel("MANUAL");
        setFornecedorCnpjManual(fornCnpj);
        setIsFornecedorManual(true);
      }

      setModalIndividualOpen(true);
    }
  }, [searchParams, options.clientes, options.fornecedores]);

  // Limpar formulário individual
  const cleanForm = () => {
    setNormaId(null);
    setClienteCnpjSel("");
    setClienteNomeManual("");
    setClienteCnpjManual("");
    setIsClienteManual(false);

    setFornecedorCnpjSel("");
    setFornecedorNomeManual("");
    setFornecedorCnpjManual("");
    setIsFornecedorManual(false);

    setCodigoProduto("");
    setDescricao("");
    setEmbalagem("");
    setLastro(0);
    setAltura(0);
    setTotalPalete(0);
  };

  const handleEdit = (norma: Norma) => {
    setNormaId(norma.id);

    // Cliente
    const cliExists = options.clientes.some((c) => c.cnpj === norma.clienteCnpj);
    if (cliExists) {
      setClienteCnpjSel(norma.clienteCnpj);
      setIsClienteManual(false);
    } else {
      setClienteCnpjSel("MANUAL");
      setClienteCnpjManual(norma.clienteCnpj);
      setClienteNomeManual(""); // Opcional, o CNPJ já identifica no DB
      setIsClienteManual(true);
    }

    // Fornecedor
    const fornExists = options.fornecedores.some((f) => f.cnpj === norma.fornecedorCnpj);
    if (fornExists) {
      setFornecedorCnpjSel(norma.fornecedorCnpj);
      setIsFornecedorManual(false);
    } else {
      setFornecedorCnpjSel("MANUAL");
      setFornecedorCnpjManual(norma.fornecedorCnpj);
      setFornecedorNomeManual("");
      setIsFornecedorManual(true);
    }

    setCodigoProduto(norma.codigoProduto);
    setDescricao(norma.descricao || "");
    setEmbalagem(norma.embalagem || "");
    setLastro(norma.lastro);
    setAltura(norma.altura);
    setTotalPalete(norma.quantidadeCaixasPalete);

    setModalIndividualOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta norma de paletização?")) return;
    try {
      const res = await fetch(`/api/normas-paletizacao?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Norma excluída com sucesso");
        fetchNormas();
      } else {
        throw new Error();
      }
    } catch {
      toast.error("Erro ao excluir norma");
    }
  };

  const handleSaveIndividual = async () => {
    const finalClienteCnpj = isClienteManual ? clienteCnpjManual.replace(/\D/g, "") : clienteCnpjSel;
    const finalFornecedorCnpj = isFornecedorManual ? fornecedorCnpjManual.replace(/\D/g, "") : fornecedorCnpjSel;

    if (!finalClienteCnpj || !finalFornecedorCnpj || !codigoProduto) {
      toast.error("Preencha Cliente, Fornecedor e Código do Produto");
      return;
    }

    if (lastro <= 0 || altura <= 0) {
      toast.error("Lastro e Altura devem ser maiores que zero");
      return;
    }

    setSaving(true);
    try {
      const method = normaId ? "PATCH" : "POST";
      const payload: any = {
        clienteCnpj: finalClienteCnpj,
        fornecedorCnpj: finalFornecedorCnpj,
        codigoProduto,
        descricao,
        embalagem,
        lastro,
        altura,
        quantidadeCaixasPalete: totalPalete,
      };

      if (normaId) {
        payload.id = normaId;
      }

      const res = await fetch("/api/normas-paletizacao", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(normaId ? "Norma atualizada!" : "Norma cadastrada com sucesso!");
        setModalIndividualOpen(false);
        cleanForm();
        fetchNormas();
        fetchOptions();
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao salvar");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar norma");
    } finally {
      setSaving(false);
    }
  };

  // Parser do colar Excel
  const parseExcelText = (text: string) => {
    if (!text.trim()) {
      setImportPreview([]);
      return;
    }

    const lines = text.trim().split(/\r?\n/);
    const parsed: any[] = [];

    lines.forEach((line) => {
      // Ignorar cabeçalho se houver e a linha for parecida com termos de planilha
      const lower = line.toLowerCase();
      if (
        (lower.includes("codigo") || lower.includes("código") || lower.includes("descri") || lower.includes("lastro")) &&
        parsed.length === 0
      ) {
        return;
      }

      const cols = line.split("\t");
      if (cols.length < 3) return; // precisa no mínimo de codprod, lastro, altura

      // Mapeamento esperado:
      // Código | Descrição | Embalagem (opcional) | Lastro | Altura | Qtd/Palete (opcional)
      // Se tiver 3 colunas: Código | Lastro | Altura
      // Se tiver 4 colunas: Código | Descrição | Lastro | Altura
      // Se tiver 5 colunas: Código | Descrição | Embalagem | Lastro | Altura
      // Se tiver 6+ colunas: Código | Descrição | Embalagem | Lastro | Altura | Qtd/Palete
      let codigo = "";
      let desc = "";
      let emb = "";
      let l = 0;
      let alt = 0;
      let tot = 0;

      if (cols.length === 3) {
        codigo = cols[0].trim();
        l = parseInt(cols[1]) || 0;
        alt = parseInt(cols[2]) || 0;
        tot = l * alt;
      } else if (cols.length === 4) {
        codigo = cols[0].trim();
        desc = cols[1].trim();
        l = parseInt(cols[2]) || 0;
        alt = parseInt(cols[3]) || 0;
        tot = l * alt;
      } else if (cols.length === 5) {
        codigo = cols[0].trim();
        desc = cols[1].trim();
        emb = cols[2].trim();
        l = parseInt(cols[3]) || 0;
        alt = parseInt(cols[4]) || 0;
        tot = l * alt;
      } else {
        codigo = cols[0].trim();
        desc = cols[1].trim();
        emb = cols[2].trim();
        l = parseInt(cols[3]) || 0;
        alt = parseInt(cols[4]) || 0;
        tot = parseInt(cols[5]) || (l * alt);
      }

      if (codigo) {
        parsed.push({
          codigoProduto: codigo,
          descricao: desc || null,
          embalagem: emb || null,
          lastro: l,
          altura: alt,
          quantidadeCaixasPalete: tot,
        });
      }
    });

    setImportPreview(parsed);
  };

  const handleSaveImport = async () => {
    const finalClienteCnpj = isImportClienteManual ? importClienteCnpjManual.replace(/\D/g, "") : importClienteCnpjSel;
    const finalFornecedorCnpj = isImportFornecedorManual ? importFornecedorCnpjManual.replace(/\D/g, "") : importFornecedorCnpjSel;

    if (!finalClienteCnpj || !finalFornecedorCnpj) {
      toast.error("Selecione ou digite o Cliente e o Fornecedor");
      return;
    }

    if (importPreview.length === 0) {
      toast.error("Nenhum dado válido para importar");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/normas-paletizacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          clienteCnpj: finalClienteCnpj,
          fornecedorCnpj: finalFornecedorCnpj,
          items: importPreview,
        }),
      });

      if (res.ok) {
        toast.success(`Importadas ${importPreview.length} normas com sucesso!`);
        setModalImportOpen(false);
        setExcelText("");
        setImportPreview([]);
        fetchNormas();
        fetchOptions();
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao importar em lote");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro na importação em lote");
    } finally {
      setSaving(false);
    }
  };

  const getRazaoSocialCliente = (cnpj: string) => {
    const cli = options.clientes.find((c) => c.cnpj === cnpj);
    return cli ? cli.razaoSocial : cnpj;
  };

  const getRazaoSocialFornecedor = (cnpj: string) => {
    const forn = options.fornecedores.find((f) => f.cnpj === cnpj);
    return forn ? forn.razaoSocial : cnpj;
  };

  return (
    <>
      <Topbar title="Normas de Paletização" subtitle="Configure o lastro e altura para conferência física dos produtos" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-5">
          {/* Ações e Busca */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Buscar por código, produto ou CNPJ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl text-sm outline-none transition-all"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setModalImportOpen(true);
                  // Reseta forms
                  setImportClienteCnpjSel("");
                  setImportFornecedorCnpjSel("");
                  setIsImportClienteManual(false);
                  setIsImportFornecedorManual(false);
                  setExcelText("");
                  setImportPreview([]);
                }}
              >
                <FileSpreadsheet size={15} /> Importar Excel/Lote
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  cleanForm();
                  setModalIndividualOpen(true);
                }}
              >
                <Plus size={15} /> Adicionar Norma Manual
              </Button>
            </div>
          </div>

          {/* Tabela de Normas */}
          <Card>
            {loading ? (
              <Loading text="Carregando normas de paletização..." />
            ) : normas.length === 0 ? (
              <Empty icon="📦" text="Nenhuma norma de paletização cadastrada no momento." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Cliente (Destinatário)</Th>
                      <Th>Fornecedor (Emitente)</Th>
                      <Th>Cód. Produto</Th>
                      <Th>Descrição</Th>
                      <Th className="text-center">Embalagem</Th>
                      <Th className="text-center">Lastro</Th>
                      <Th className="text-center">Altura</Th>
                      <Th className="text-center">Caixas / Palete</Th>
                      <Th className="text-right">Ações</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {normas.map((norma) => (
                      <Tr key={norma.id}>
                        <Td>
                          <div className="font-semibold text-slate-200">{getRazaoSocialCliente(norma.clienteCnpj)}</div>
                          <div className="text-[10px] font-mono text-slate-500">{formatCnpj(norma.clienteCnpj)}</div>
                        </Td>
                        <Td>
                          <div className="font-medium text-slate-300">{getRazaoSocialFornecedor(norma.fornecedorCnpj)}</div>
                          <div className="text-[10px] font-mono text-slate-500">{formatCnpj(norma.fornecedorCnpj)}</div>
                        </Td>
                        <Td className="font-mono text-xs font-semibold text-[var(--accent)]">{norma.codigoProduto}</Td>
                        <Td className="max-w-xs truncate" title={norma.descricao || ""}>
                          {norma.descricao || <span className="italic text-slate-500">Sem descrição</span>}
                        </Td>
                        <Td className="text-center font-mono text-xs">{norma.embalagem || "-"}</Td>
                        <Td className="text-center font-semibold text-emerald-400">{norma.lastro}</Td>
                        <Td className="text-center font-semibold text-emerald-400">{norma.altura}</Td>
                        <Td className="text-center font-bold text-orange-400">{norma.quantidadeCaixasPalete}</Td>
                        <Td className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleEdit(norma)}
                              className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                              style={{ background: "var(--surface2)", color: "var(--text2)" }}
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => handleDelete(norma.id)}
                              className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                              style={{ background: "rgba(239,68,68,.1)", color: "#ef4444" }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal Cadastro/Edição Manual Individual */}
      <Modal
        open={modalIndividualOpen}
        onClose={() => setModalIndividualOpen(false)}
        title={normaId ? "Editar Norma de Paletização" : "Nova Norma de Paletização"}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Seletor Cliente */}
            {!isClienteManual ? (
              <ComboboxPesquisa
                label="Cliente (Destinatário)"
                options={clientOptions}
                value={clienteCnpjSel}
                onChange={(val) => setClienteCnpjSel(val)}
                onManual={() => {
                  setIsClienteManual(true);
                  setClienteCnpjSel("MANUAL");
                }}
                placeholder="Selecionar Cliente..."
                searchPlaceholder="Buscar cliente por nome ou CNPJ..."
                manualLabel="+ Digitar CNPJ Manualmente..."
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>
                    CNPJ Cliente Manual
                  </label>
                  <button
                    onClick={() => {
                      setIsClienteManual(false);
                      setClienteCnpjSel("");
                    }}
                    className="text-[9px] underline text-slate-400 hover:text-white"
                  >
                    Usar Lista
                  </button>
                </div>
                <Input
                  value={clienteCnpjManual}
                  onChange={(e) => setClienteCnpjManual(e.target.value)}
                  placeholder="00.000.000/0001-00"
                />
              </div>
            )}

            {/* Seletor Fornecedor */}
            {!isFornecedorManual ? (
              <ComboboxPesquisa
                label="Fornecedor (Emitente)"
                options={supplierOptions}
                value={fornecedorCnpjSel}
                onChange={(val) => setFornecedorCnpjSel(val)}
                onManual={() => {
                  setIsFornecedorManual(true);
                  setFornecedorCnpjSel("MANUAL");
                }}
                placeholder="Selecionar Fornecedor..."
                searchPlaceholder="Buscar fornecedor por nome ou CNPJ..."
                manualLabel="+ Digitar CNPJ Manualmente..."
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>
                    CNPJ Fornecedor Manual
                  </label>
                  <button
                    onClick={() => {
                      setIsFornecedorManual(false);
                      setFornecedorCnpjSel("");
                    }}
                    className="text-[9px] underline text-slate-400 hover:text-white"
                  >
                    Usar Lista
                  </button>
                </div>
                <Input
                  value={fornecedorCnpjManual}
                  onChange={(e) => setFornecedorCnpjManual(e.target.value)}
                  placeholder="00.000.000/0001-00"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Código do Produto"
              value={codigoProduto}
              onChange={(e) => setCodigoProduto(e.target.value)}
              placeholder="Ex: 35431"
            />
            <Input
              label="Embalagem (Opcional)"
              value={embalagem}
              onChange={(e) => setEmbalagem(e.target.value)}
              placeholder="Ex: 8X1 ou CX"
            />
          </div>

          <Input
            label="Descrição do Produto (Opcional)"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: ABS DIANA ACTIVE 40"
          />

          <div className="grid grid-cols-3 gap-4 p-4 rounded-xl" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <Input
              label="Lastro"
              type="number"
              value={lastro || ""}
              onChange={(e) => setLastro(parseInt(e.target.value) || 0)}
              placeholder="Ex: 6"
            />
            <Input
              label="Altura"
              type="number"
              value={altura || ""}
              onChange={(e) => setAltura(parseInt(e.target.value) || 0)}
              placeholder="Ex: 6"
            />
            <Input
              label="Total p/ Palete"
              type="number"
              value={totalPalete || ""}
              onChange={(e) => setTotalPalete(parseInt(e.target.value) || 0)}
              placeholder="Autocalculado"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setModalIndividualOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSaveIndividual} loading={saving}>
              <Save size={14} /> Salvar Norma
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Importar Lote via Excel */}
      <Modal
        open={modalImportOpen}
        onClose={() => setModalImportOpen(false)}
        title="Importar Normas em Lote (Excel)"
        size="lg"
      >
        <div className="space-y-4">
          <div className="bg-blue-600/10 border border-blue-500/20 text-blue-400 p-3 rounded-xl flex items-start gap-3">
            <Info size={18} className="flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-bold">Como importar normas do Excel:</div>
              <div>Selecione o Cliente e o Fornecedor e cole abaixo os dados copiados de sua planilha.</div>
              <div>A ordem de colunas aceita é: <strong className="text-white font-mono text-[10px]">Cód Produto [Tab] Descrição [Tab] Embalagem [Tab] Lastro [Tab] Altura [Tab] Qtd Caixa Palete</strong></div>
              <div>Obs: A primeira linha de cabeçalho será descartada automaticamente se contiver texto de identificação.</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Seletor Cliente Importação */}
            {!isImportClienteManual ? (
              <ComboboxPesquisa
                label="Cliente (Destinatário da Entrega)"
                options={clientOptions}
                value={importClienteCnpjSel}
                onChange={(val) => setImportClienteCnpjSel(val)}
                onManual={() => {
                  setIsImportClienteManual(true);
                  setImportClienteCnpjSel("MANUAL");
                }}
                placeholder="Selecionar Cliente..."
                searchPlaceholder="Buscar cliente por nome ou CNPJ..."
                manualLabel="+ Digitar CNPJ Manualmente..."
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>
                    CNPJ Cliente Manual
                  </label>
                  <button
                    onClick={() => {
                      setIsImportClienteManual(false);
                      setImportClienteCnpjSel("");
                    }}
                    className="text-[9px] underline text-slate-400 hover:text-white"
                  >
                    Usar Lista
                  </button>
                </div>
                <Input
                  value={importClienteCnpjManual}
                  onChange={(e) => setImportClienteCnpjManual(e.target.value)}
                  placeholder="00.000.000/0001-00"
                />
              </div>
            )}

            {/* Seletor Fornecedor Importação */}
            {!isImportFornecedorManual ? (
              <ComboboxPesquisa
                label="Fornecedor (Emitente das NFs)"
                options={supplierOptions}
                value={importFornecedorCnpjSel}
                onChange={(val) => setImportFornecedorCnpjSel(val)}
                onManual={() => {
                  setIsImportFornecedorManual(true);
                  setImportFornecedorCnpjSel("MANUAL");
                }}
                placeholder="Selecionar Fornecedor..."
                searchPlaceholder="Buscar fornecedor por nome ou CNPJ..."
                manualLabel="+ Digitar CNPJ Manualmente..."
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>
                    CNPJ Fornecedor Manual
                  </label>
                  <button
                    onClick={() => {
                      setIsImportFornecedorManual(false);
                      setImportFornecedorCnpjSel("");
                    }}
                    className="text-[9px] underline text-slate-400 hover:text-white"
                  >
                    Usar Lista
                  </button>
                </div>
                <Input
                  value={importFornecedorCnpjManual}
                  onChange={(e) => setImportFornecedorCnpjManual(e.target.value)}
                  placeholder="00.000.000/0001-00"
                />
              </div>
            )}
          </div>

          <Textarea
            label="Cole os dados do Excel aqui"
            value={excelText}
            onChange={(e) => {
              setExcelText(e.target.value);
              parseExcelText(e.target.value);
            }}
            placeholder="Cole as colunas de produtos copiadas do Excel (Cód, Descrição, Embalagem, Lastro, Altura, Qtd)..."
            rows={6}
          />

          {importPreview.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest font-mono text-slate-400">
                Visualização Prévia ({importPreview.length} produtos detectados)
              </div>
              <div className="max-h-[250px] overflow-y-auto border border-slate-800 rounded-xl">
                <Table className="text-xs">
                  <thead>
                    <tr>
                      <Th className="py-2">Código</Th>
                      <Th className="py-2">Descrição</Th>
                      <Th className="py-2 text-center">Embalagem</Th>
                      <Th className="py-2 text-center">Lastro</Th>
                      <Th className="py-2 text-center">Altura</Th>
                      <Th className="py-2 text-center">Qtd Caixa Palete</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-800/50">
                        <Td className="py-2 font-mono text-[var(--accent)]">{item.codigoProduto}</Td>
                        <Td className="py-2 truncate max-w-[200px]">{item.descricao || "-"}</Td>
                        <Td className="py-2 text-center font-mono text-[11px]">{item.embalagem || "-"}</Td>
                        <Td className="py-2 text-center font-semibold text-emerald-400">{item.lastro}</Td>
                        <Td className="py-2 text-center font-semibold text-emerald-400">{item.altura}</Td>
                        <Td className="py-2 text-center font-bold text-orange-400">{item.quantidadeCaixasPalete}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalImportOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveImport}
              loading={saving}
              disabled={importPreview.length === 0}
            >
              <Save size={14} /> Importar {importPreview.length || ""} Normas
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
