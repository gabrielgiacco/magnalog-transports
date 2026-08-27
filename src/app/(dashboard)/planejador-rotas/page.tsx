"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import { Topbar } from "@/components/layout/Topbar";
import { Button, Card, Loading, Input, Select, ComboboxMotorista } from "@/components/ui";
import { Map, MapPin, Truck, Calendar, Save, Trash2, RefreshCw, Search, Navigation, Navigation2, Plus, AlertCircle, Filter, X, Package } from "lucide-react";
import { formatWeight, formatCurrency } from "@/lib/utils";
import { DEPOSITO } from "@/lib/rota-trajeto";
import type { MapEntrega } from "@/components/map/RouteMap";

interface Trajeto {
  distanciaKm: number;
  duracaoHoras: number;
  linha: [number, number][];
  aproximado: boolean;
}

// Carregar o mapa dinamicamente, com SSR desabilitado
const RouteMap = dynamic(() => import("@/components/map/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400 rounded-lg border border-slate-200">
      <Loading />
      <span className="mt-4 text-sm font-medium">Carregando Mapa...</span>
    </div>
  ),
});

export default function PlanejadorRotasPage() {
  const router = useRouter();
  const [entregas, setEntregas] = useState<MapEntrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Rota Form
  const [motoristas, setMotoristas] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [form, setForm] = useState({ data: "", motoristaId: "", veiculoId: "", valorMotorista: "", observacoes: "" });
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusDelivery, setFocusDelivery] = useState<string | null>(null);
  const [selectedFornecedores, setSelectedFornecedores] = useState<string[]>([]);
  const [trajeto, setTrajeto] = useState<Trajeto | null>(null);
  const [calculandoTrajeto, setCalculandoTrajeto] = useState(false);
  const [retornarDeposito, setRetornarDeposito] = useState(true);

  useEffect(() => {
    fetchData();
    fetch("/api/motoristas?ativo=true").then((r) => r.json()).then(setMotoristas);
    fetch("/api/veiculos").then((r) => r.json()).then(setVeiculos);
    
    const hoje = new Date();
    setForm(f => ({ ...f, data: hoje.toISOString().split("T")[0] }));
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/entregas-mapa");
      const data = await res.json();
      setEntregas(data);
    } catch (error) {
      toast.error("Erro ao carregar entregas");
    } finally {
      setLoading(false);
    }
  }

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  function toggleEntrega(id: string) {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleGeocodePending() {
    setGeocoding(true);
    const toastId = toast.loading("Geocodificando endereços pendentes... Isso pode levar alguns segundos.");
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allPending: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao geocodificar");
      
      toast.success(`Concluído! \${data.geocoded} geocodificados, \${data.errors} erros.`, { id: toastId });
      if (data.geocoded > 0) {
        fetchData(); // Recarrega o mapa
      }
    } catch (error: any) {
      toast.error(error.message || "Erro na geocodificação", { id: toastId });
    } finally {
      setGeocoding(false);
    }
  }

  async function handleCreateRoute() {
    if (selectedIds.length === 0) {
      toast.error("Selecione pelo menos uma entrega no mapa");
      return;
    }
    if (!form.data) {
      toast.error("A data da rota é obrigatória");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        entregaIds: selectedIds
      };
      
      const res = await fetch("/api/rotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao criar rota");
      }
      
      toast.success("Rota criada com sucesso!");
      setSelectedIds([]);
      setForm(f => ({ ...f, motoristaId: "", veiculoId: "", valorMotorista: "", observacoes: "" }));
      fetchData(); // Atualiza mapa removendo os itens que ganharam rota
      
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar rota");
    } finally {
      setSaving(false);
    }
  }

  // Extrair fornecedores únicos de todas as entregas
  const fornecedoresUnicos = useMemo(() => {
    const set = new Set<string>();
    entregas.forEach(e => {
      e.notas?.forEach(n => {
        if (n.emitenteRazao) set.add(n.emitenteRazao);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [entregas]);

  function toggleFornecedor(nome: string) {
    setSelectedFornecedores(prev =>
      prev.includes(nome) ? prev.filter(f => f !== nome) : [...prev, nome]
    );
  }

  // Helper: verifica se uma entrega pertence a algum fornecedor selecionado
  function matchFornecedor(e: MapEntrega) {
    if (selectedFornecedores.length === 0) return true;
    return e.notas?.some(n => n.emitenteRazao && selectedFornecedores.includes(n.emitenteRazao)) ?? false;
  }

  function matchBusca(e: MapEntrega) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (e.razaoSocial || "").toLowerCase().includes(q) ||
      (e.codigo || "").toLowerCase().includes(q) ||
      (e.cidade || "").toLowerCase().includes(q) ||
      (e.notas?.some(n => (n.numero || "").toLowerCase().includes(q)) ?? false)
    );
  }

  // A busca vale para o mapa também: filtrar por "costa" e continuar vendo os
  // 41 pinos do fornecedor inteiro fazia o filtro parecer quebrado.
  // Entrega já selecionada nunca some do mapa — ela é a rota em construção.
  const mapEntregas = useMemo(
    () => entregas.filter(e =>
      e.latitude != null && e.longitude != null &&
      (selectedIds.includes(e.id) || (matchFornecedor(e) && matchBusca(e)))
    ),
    [entregas, selectedFornecedores, searchQuery, selectedIds]
  );

  // Ordem de clique = ordem das paradas na rota, por isso percorre selectedIds
  // e não entregas.
  const selectedEntregas = useMemo(
    () => selectedIds.map(id => entregas.find(e => e.id === id)).filter(Boolean) as MapEntrega[],
    [selectedIds, entregas]
  );
  const totalPeso = selectedEntregas.reduce((s, e) => s + (e.pesoTotal || 0), 0);
  const totalVol = selectedEntregas.reduce((s, e) => s + (e.volumeTotal || 0), 0);
  const totalDescarga = selectedEntregas.reduce((s, e) => s + (e.valorDescarga || 0), 0);

  // Recalcula o traçado a cada parada adicionada ou removida. O atraso segura
  // a rajada de chamadas de quem monta a rota clicando rápido no mapa.
  useEffect(() => {
    const paradas = selectedEntregas
      .filter(e => e.latitude != null && e.longitude != null)
      .map(e => ({ lat: e.latitude, lng: e.longitude }));

    if (paradas.length === 0) { setTrajeto(null); return; }

    let cancelado = false;
    const timer = setTimeout(async () => {
      setCalculandoTrajeto(true);
      try {
        const res = await fetch("/api/rotas/trajeto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paradas, retornarDeposito }),
        });
        const data = await res.json();
        if (!cancelado) setTrajeto(res.ok ? data : null);
      } catch {
        if (!cancelado) setTrajeto(null);
      } finally {
        if (!cancelado) setCalculandoTrajeto(false);
      }
    }, 500);

    return () => { cancelado = true; clearTimeout(timer); };
  }, [selectedEntregas, retornarDeposito]);

  const disponiveis = entregas.filter(e => !selectedIds.includes(e.id) && matchFornecedor(e));
  const filteredDisponiveis = disponiveis.filter(matchBusca);

  function focusOnMap(e: MapEntrega) {
    if (e.latitude && e.longitude) {
      setFocusDelivery(e.id);
      // Reset after a moment to allow re-centering if clicked again
      setTimeout(() => setFocusDelivery(null), 1000);
    } else {
      toast.error("Esta entrega não possui coordenadas geográficas.");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Topbar
        title="Planejador de Rotas"
        subtitle="Crie rotas agrupando entregas por proximidade geográfica"
        actions={
          <Button variant="ghost" onClick={handleGeocodePending} loading={geocoding}>
            <MapPin size={15} /> Geocodificar Pendentes
          </Button>
        }
      />

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Lado Esquerdo: MAPA (70%) */}
        <div className="flex-1 lg:flex-[7] flex flex-col p-4 relative z-0 h-[50vh] lg:h-auto gap-3">
          
          {/* Filtro de Fornecedores — acima do mapa */}
          {fornecedoresUnicos.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1.5 text-slate-500 mr-1 shrink-0">
                <Package size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Fornecedor</span>
              </div>
              <div className="h-5 w-px bg-slate-200 shrink-0" />
              {fornecedoresUnicos.map(nome => {
                const isActive = selectedFornecedores.includes(nome);
                // Pegar um nome mais curto/legível para exibir
                const displayName = nome.split(" ").slice(0, 3).join(" ");
                const count = entregas.filter(e => e.notas?.some(n => n.emitenteRazao === nome)).length;
                return (
                  <button
                    key={nome}
                    onClick={() => toggleFornecedor(nome)}
                    title={nome}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 border ${
                      isActive
                        ? "bg-orange-500 text-white border-orange-500 shadow-sm shadow-orange-500/25"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                    }`}
                  >
                    {displayName}
                    <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                      isActive ? "bg-orange-600/30 text-orange-100" : "bg-slate-200/80 text-slate-500"
                    }`}>{count}</span>
                    {isActive && <X size={10} className="ml-0.5" />}
                  </button>
                );
              })}
              {selectedFornecedores.length > 0 && (
                <button
                  onClick={() => setSelectedFornecedores([])}
                  className="text-[10px] text-rose-500 hover:text-rose-600 font-semibold ml-1 underline underline-offset-2"
                >
                  Limpar filtro
                </button>
              )}
            </div>
          )}

          <Card className="flex-1 w-full p-0 overflow-hidden shadow-md" style={{ border: "1px solid var(--border)" }}>
            {loading ? (
              <div className="w-full h-full flex items-center justify-center"><Loading /></div>
            ) : mapEntregas.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-500">
                <Map size={48} className="mb-4 text-slate-300" />
                <p>
                  {searchQuery
                    ? `Nenhuma entrega com coordenadas para "${searchQuery}".`
                    : selectedFornecedores.length > 0
                      ? "Nenhuma entrega com coordenadas para os fornecedores selecionados."
                      : "Nenhuma entrega disponível com coordenadas."}
                </p>
                {searchQuery ? (
                  <Button variant="ghost" className="mt-4" onClick={() => setSearchQuery("")}>
                    Limpar Busca
                  </Button>
                ) : selectedFornecedores.length > 0 ? (
                  <Button variant="ghost" className="mt-4" onClick={() => setSelectedFornecedores([])}>
                    Limpar Filtro
                  </Button>
                ) : (
                  <Button variant="ghost" className="mt-4" onClick={handleGeocodePending}>
                    Tentar Geocodificar
                  </Button>
                )}
              </div>
            ) : (
              <RouteMap
                entregas={mapEntregas}
                selectedIds={selectedIds}
                onToggleEntrega={toggleEntrega}
                focusId={focusDelivery || undefined}
                trajeto={trajeto?.linha}
                trajetoAproximado={trajeto?.aproximado}
                deposito={DEPOSITO}
              />
            )}
          </Card>
        </div>

        {/* Lado Direito: PAINEL DE CRIAÇÃO (30%) */}
        <div className="flex-1 lg:flex-[3] w-full lg:max-w-md bg-white border-t lg:border-t-0 lg:border-l border-slate-200 overflow-y-auto flex flex-col z-10" style={{ background: "var(--surface)" }}>
          <div className="p-5 flex-1 flex flex-col gap-6">
            
            {/* Resumo da Seleção */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-3 text-slate-500 flex items-center justify-between">
                <span>Resumo da Rota</span>
                {selectedIds.length > 0 && (
                  <button onClick={() => setSelectedIds([])} className="text-rose-500 hover:text-rose-600 flex items-center gap-1">
                    <Trash2 size={12} /> Limpar
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                  <div className="text-2xl font-black text-orange-600">{selectedIds.length}</div>
                  <div className="text-[10px] font-mono text-orange-600/70 uppercase">Entregas</div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                  <div className="text-xl font-black text-slate-700">{formatWeight(totalPeso)}</div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">Peso Total</div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                  <div className="text-xl font-black text-slate-700">{totalVol}</div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">Volumes</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-center col-span-3 mt-1">
                  <div className="text-[10px] font-mono text-indigo-600/70 uppercase">Custo Total de Descarga</div>
                  <div className="text-xl font-black text-indigo-700">{formatCurrency(totalDescarga)}</div>
                </div>

                {selectedIds.length > 0 && (
                  <div className="col-span-3 mt-1 rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-blue-600/70">
                        <Navigation size={12} />
                        Distância da Rota
                      </div>
                      {calculandoTrajeto && <RefreshCw size={12} className="animate-spin text-blue-500" />}
                    </div>

                    {trajeto ? (
                      <>
                        <div className="mt-1 flex items-baseline gap-3">
                          <span className="text-2xl font-black text-blue-700">
                            {trajeto.distanciaKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km
                          </span>
                          {trajeto.duracaoHoras > 0 && (
                            <span className="font-mono text-xs text-blue-600/80">
                              ~{Math.floor(trajeto.duracaoHoras)}h{String(Math.round((trajeto.duracaoHoras % 1) * 60)).padStart(2, "0")} dirigindo
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[10px] leading-snug text-blue-600/70">
                          {trajeto.aproximado
                            ? "Em linha reta — o roteador não respondeu, a distância real por estrada é maior."
                            : `Por estrada, saindo do depósito${retornarDeposito ? " e voltando para ele" : ""}.`}
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 text-xs text-blue-600/60">
                        {calculandoTrajeto ? "Calculando…" : "Nenhuma parada com coordenada."}
                      </div>
                    )}

                    <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-blue-100 pt-2 text-[11px] text-blue-700">
                      <input
                        type="checkbox"
                        checked={retornarDeposito}
                        onChange={e => setRetornarDeposito(e.target.checked)}
                        className="accent-blue-600"
                      />
                      Incluir retorno ao depósito
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Busca e Lista de Disponíveis */}
            <div className="flex flex-col min-h-0 h-[400px]">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2 text-slate-500 flex items-center justify-between">
                <span>Entregas Disponíveis ({filteredDisponiveis.length})</span>
              </div>
              
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="NF ou Razão Social..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-xs outline-none border border-slate-200 focus:border-orange-500 transition-colors"
                  style={{ background: "var(--surface2)" }}
                />
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1">
                {filteredDisponiveis.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 italic text-center p-4">
                    {searchQuery ? "Nenhuma entrega encontrada." : "Todas as entregas foram adicionadas."}
                  </div>
                ) : (
                  filteredDisponiveis.map(e => (
                    <div key={e.id} className="bg-white p-2.5 rounded border border-slate-200 shadow-sm flex items-center justify-between gap-2 group hover:border-orange-200 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <div className="text-xs font-bold text-slate-800 truncate">{e.razaoSocial}</div>
                          {(!e.latitude || !e.longitude) && (
                            <span title="Endereço não geocodificado">
                              <AlertCircle size={12} className="text-rose-500" />
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">{e.cidade} - {e.notas?.map((n:any)=>n.numero).join(", ") || e.codigo}</div>
                      </div>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => focusOnMap(e)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400" title="Ver no mapa">
                          <Navigation2 size={14} />
                        </button>
                        <button onClick={() => toggleEntrega(e.id)} className="p-1.5 rounded bg-orange-100 text-orange-600 hover:bg-orange-200" title="Adicionar à rota">
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Lista de Selecionados */}
            <div className="flex flex-col min-h-0 h-[200px]">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2 text-slate-500">Selecionadas ({selectedIds.length})</div>
              <div className="flex-1 overflow-y-auto bg-orange-50/30 border border-orange-100 rounded-lg p-2 space-y-1">
                {selectedEntregas.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 italic text-center p-4">
                    Nenhuma selecionada.
                  </div>
                ) : (
                  selectedEntregas.map(e => (
                    <div key={e.id} className="bg-white p-2.5 rounded border border-orange-200 shadow-sm flex items-center justify-between gap-2 group">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800 truncate">{e.razaoSocial}</div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">{e.cidade} - {e.notas?.map((n:any)=>n.numero).join(", ") || e.codigo}</div>
                      </div>
                      <button onClick={() => toggleEntrega(e.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                        <X_Icon size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Formulário */}
            <div className="space-y-4 pt-4 border-t border-slate-200">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dados da Rota</div>
              
              <Input 
                type="date" 
                value={form.data} 
                onChange={e => set("data", e.target.value)} 
              />
              
              <ComboboxMotorista 
                motoristas={motoristas} 
                veiculos={veiculos} 
                value={form.motoristaId} 
                onChange={id => set("motoristaId", id)} 
                onAutoFillVeiculo={vid => set("veiculoId", vid)} 
              />
              
              <Select value={form.veiculoId} onChange={e => set("veiculoId", e.target.value)}>
                <option value="">Veículo (Opcional)...</option>
                {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.tipo}</option>)}
              </Select>

              <Button 
                className="w-full h-12 text-sm font-bold shadow-lg shadow-orange-500/20" 
                disabled={selectedIds.length === 0} 
                loading={saving}
                onClick={handleCreateRoute}
              >
                <Save size={16} /> Gerar Rota com {selectedIds.length} Entregas
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// Ícone simples inline
function X_Icon({ size = 24, ...props }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
