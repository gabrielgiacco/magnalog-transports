"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loading, StatusBadge } from "@/components/ui";
import { formatDate, formatWeight } from "@/lib/utils";
import { Search, LogOut, FileText, ChevronLeft, ChevronRight, Package, AlertTriangle, Filter, X, Eye, Truck, MapPin, Calendar, User, Clock, Building2 } from "lucide-react";


const STATUS_LABELS: Record<string, string> = {
  PROGRAMADO: "Programado", EM_SEPARACAO: "Em Separação", CARREGADO: "Carregado",
  EM_ROTA: "Em Rota", ENTREGUE: "Entregue", FINALIZADO: "Finalizado", OCORRENCIA: "Ocorrência",
};

export default function PortalPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notas, setNotas] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ EM_SEPARACAO: 0, OCORRENCIA: 0, FINALIZADAS: 0, EM_ROTA: 0 });
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEmitente, setFilterEmitente] = useState("");
  const [filterCidade, setFilterCidade] = useState("");
  const [filterDataEmissao, setFilterDataEmissao] = useState("");
  const [filterDestinatario, setFilterDestinatario] = useState("");
  const [filterVolumes, setFilterVolumes] = useState("");
  const [filterPeso, setFilterPeso] = useState("");
  const [filterDataChegada, setFilterDataChegada] = useState("");
  const [filterDataEntrega, setFilterDataEntrega] = useState("");
  const [filterDataAgendada, setFilterDataAgendada] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [detalheNota, setDetalheNota] = useState<any | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (openDropdown && !(e.target as HTMLElement).closest("th")) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openDropdown]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);


  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (debouncedSearch) params.set("numero", debouncedSearch);
    if (filterStatus) params.set("status", filterStatus);
    if (filterEmitente) params.set("emitente", filterEmitente);
    if (filterCidade) params.set("cidade", filterCidade);
    if (filterDataEmissao) params.set("dataEmissao", filterDataEmissao);
    if (filterDestinatario) params.set("destinatario", filterDestinatario);
    if (filterVolumes) params.set("volumes", filterVolumes);
    if (filterPeso) params.set("peso", filterPeso);
    if (filterDataAgendada) params.set("dataAgendada", filterDataAgendada);
    if (filterDataChegada) params.set("dataChegada", filterDataChegada);
    if (filterDataEntrega) params.set("dataEntrega", filterDataEntrega);
    
    const res = await fetch(`/api/portal?${params}`, { cache: "no-store" });
    const data = await res.json();
    setNotas(data.notas || []);
    setTotal(data.total || 0);
    setPages(data.pages || 1);
    setStats(data.stats || { EM_SEPARACAO: 0, OCORRENCIA: 0, FINALIZADAS: 0, EM_ROTA: 0 });
    setLoading(false);
  }, [page, debouncedSearch, filterStatus, filterEmitente, filterCidade, filterDataEmissao, filterDestinatario, filterVolumes, filterPeso, filterDataAgendada, filterDataChegada, filterDataEntrega]);

  useEffect(() => { if (session) fetchData(); }, [session, fetchData]);

  if (status === "loading") return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <Loading text="Carregando portal..." />
    </div>
  );

  const user = session?.user as any;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="MAGNALOG" className="h-8 w-auto object-contain" />
          <div className="h-5 w-px" style={{ background: "var(--border2)" }} />
          <div>
            <div className="text-sm font-semibold">Portal do Cliente</div>
            <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>Acompanhamento de Cargas</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium">{user?.name}</div>
            <div className="text-[10px]" style={{ color: "var(--text3)" }}>{user?.email}</div>
          </div>
          {user?.image && <img src={user.image} alt="" className="w-9 h-9 rounded-full" />}
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:opacity-70"
            style={{ background: "var(--surface2)", color: "var(--text2)", border: "1px solid var(--border)" }}>
            <LogOut size={12} /> Sair
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats / Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <button
            onClick={() => { setFilterStatus(""); setPage(1); }}
            className={`text-left rounded-xl p-5 transition-all relative overflow-hidden ${filterStatus === "" ? "ring-2 ring-offset-2 ring-blue-500" : "hover:opacity-80"}`}
            style={{ 
              background: "var(--surface)", 
              border: "1px solid var(--border)",
              borderColor: filterStatus === "" ? "var(--accent)" : "var(--border)"
            }}
          >
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2 z-10 relative" style={{ color: "var(--text3)" }}>Total de NFs</div>
            <div className="font-head text-3xl font-black z-10 relative" style={{ color: "var(--accent)" }}>{total}</div>
            <div className="absolute bottom-0 left-0 h-1 transition-all duration-1000" style={{ background: "var(--accent)", width: "100%", opacity: 0.5 }} />
          </button>

          {[
            { id: "EM_SEPARACAO", label: "Em Separação", value: stats.EM_SEPARACAO, color: "#f59e0b" },
            { id: "EM_ROTA", label: "Em Trânsito", value: stats.EM_ROTA, color: "#8b5cf6" },
            { id: "OCORRENCIA", label: "Ocorrências", value: stats.OCORRENCIA, color: "#ef4444" },
            { id: "FINALIZADAS", label: "Finalizadas", value: stats.FINALIZADAS, color: "#10b981" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => { setFilterStatus(item.id); setPage(1); }}
              className={`text-left rounded-xl p-5 transition-all relative overflow-hidden ${filterStatus === item.id ? "ring-2 ring-offset-2" : "hover:opacity-80"}`}
              style={{ 
                background: "var(--surface)", 
                border: "1px solid var(--border)",
                borderColor: filterStatus === item.id ? item.color : "var(--border)",
                "--tw-ring-color": item.color
              } as any}
            >
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2 z-10 relative" style={{ color: "var(--text3)" }}>{item.label}</div>
              <div className="font-head text-3xl font-black z-10 relative" style={{ color: item.color }}>{item.value}</div>
              <div className="absolute bottom-0 left-0 h-1 transition-all duration-1000" style={{ background: item.color, width: total > 0 ? `${(item.value / total) * 100}%` : '0%', opacity: 0.5 }} />
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text3)" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por NF, cliente, emitente, cidade, CNPJ..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Active Filters Badges */}
        {(filterEmitente || filterCidade || filterDataEmissao || filterDestinatario || filterVolumes || filterPeso || filterDataChegada || filterDataEntrega || filterDataAgendada || debouncedSearch) && (
          <div className="flex flex-wrap gap-2 mb-5 items-center">
            <span className="text-xs" style={{ color: "var(--text3)" }}>Filtros ativos:</span>
            {debouncedSearch && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Busca: {debouncedSearch}</span>
                <button onClick={() => { setSearch(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterEmitente && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Emitente: {filterEmitente}</span>
                <button onClick={() => { setFilterEmitente(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterDestinatario && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Destinatário: {filterDestinatario}</span>
                <button onClick={() => { setFilterDestinatario(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterCidade && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Cidade: {filterCidade}</span>
                <button onClick={() => { setFilterCidade(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterVolumes && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Volumes: {filterVolumes}</span>
                <button onClick={() => { setFilterVolumes(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterPeso && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Peso: {formatWeight(parseFloat(filterPeso))}</span>
                <button onClick={() => { setFilterPeso(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterDataEmissao && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Emissão: {formatDate(filterDataEmissao)}</span>
                <button onClick={() => { setFilterDataEmissao(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterDataAgendada && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Agendamento: {formatDate(filterDataAgendada)}</span>
                <button onClick={() => { setFilterDataAgendada(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterDataChegada && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Chegada: {formatDate(filterDataChegada)}</span>
                <button onClick={() => { setFilterDataChegada(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterDataEntrega && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Entrega: {formatDate(filterDataEntrega)}</span>
                <button onClick={() => { setFilterDataEntrega(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            <button onClick={() => { 
              setFilterEmitente(""); 
              setFilterDestinatario(""); 
              setFilterCidade(""); 
              setFilterVolumes(""); 
              setFilterPeso(""); 
              setFilterDataEmissao(""); 
              setFilterDataAgendada("");
              setFilterDataChegada(""); 
              setFilterDataEntrega(""); 
              setSearch("");
              setPage(1); 
            }} className="text-xs hover:underline ml-2" style={{ color: "var(--text3)" }}>Limpar todos</button>
          </div>
        )}


        {/* Notes table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {loading ? <Loading /> : notas.length === 0 ? (
            <div className="text-center py-16">
              <Package size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm" style={{ color: "var(--text3)" }}>Nenhuma nota fiscal encontrada</p>
            </div>
          ) : (
            <>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>NF / Série</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "numero" ? null : "numero")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${debouncedSearch ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "numero" && (
                        <div className="absolute left-4 top-full mt-1 w-56 rounded-xl p-2.5 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-1 py-1 mb-2 border-b" style={{ borderColor: "var(--border)" }}>Buscar NF</div>
                          <input 
                            type="text" 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Número da NF..."
                            className="w-full px-2 py-1.5 rounded-lg outline-none text-xs border"
                            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                          />
                          {search && (
                            <button onClick={() => { setSearch(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Busca
                            </button>
                          )}
                        </div>
                      )}
                    </th>
                    
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>Emitente</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "emitente" ? null : "emitente")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${filterEmitente ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "emitente" && (
                        <div className="absolute left-4 top-full mt-1 w-56 rounded-xl p-2 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-2 py-1 mb-1 border-b" style={{ borderColor: "var(--border)" }}>Filtrar Emitente</div>
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 font-sans">
                            {Array.from(new Set(notas.map(n => n.emitenteRazao))).filter(Boolean).map((emit: any) => (
                              <button key={emit} onClick={() => { setFilterEmitente(emit); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors truncate">
                                {emit}
                              </button>
                            ))}
                            {Array.from(new Set(notas.map(n => n.emitenteRazao))).filter(Boolean).length === 0 && (
                              <span className="text-gray-500 px-2 py-1">Nenhum emitente na lista</span>
                            )}
                          </div>
                          {filterEmitente && (
                            <button onClick={() => { setFilterEmitente(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Filtro
                            </button>
                          )}
                        </div>
                      )}
                    </th>

                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>Destinatário</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "destinatario" ? null : "destinatario")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${filterDestinatario ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "destinatario" && (
                        <div className="absolute left-4 top-full mt-1 w-56 rounded-xl p-2 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-2 py-1 mb-1 border-b" style={{ borderColor: "var(--border)" }}>Filtrar Destinatário</div>
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 font-sans">
                            {Array.from(new Set(notas.map(n => n.destinatarioRazao))).filter(Boolean).map((dest: any) => (
                              <button key={dest} onClick={() => { setFilterDestinatario(dest); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors truncate">
                                {dest}
                              </button>
                            ))}
                            {Array.from(new Set(notas.map(n => n.destinatarioRazao))).filter(Boolean).length === 0 && (
                              <span className="text-gray-500 px-2 py-1">Nenhum destinatário na lista</span>
                            )}
                          </div>
                          {filterDestinatario && (
                            <button onClick={() => { setFilterDestinatario(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Filtro
                            </button>
                          )}
                        </div>
                      )}
                    </th>
                    
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>Cidade</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "cidade" ? null : "cidade")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${filterCidade ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "cidade" && (
                        <div className="absolute left-4 top-full mt-1 w-56 rounded-xl p-2 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-2 py-1 mb-1 border-b" style={{ borderColor: "var(--border)" }}>Filtrar Cidade</div>
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 font-sans">
                            {Array.from(new Set(notas.map(n => n.cidade))).filter(Boolean).map((cid: any) => (
                              <button key={cid} onClick={() => { setFilterCidade(cid); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors truncate">
                                {cid}
                              </button>
                            ))}
                            {Array.from(new Set(notas.map(n => n.cidade))).filter(Boolean).length === 0 && (
                              <span className="text-gray-500 px-2 py-1">Nenhuma cidade na lista</span>
                            )}
                          </div>
                          {filterCidade && (
                            <button onClick={() => { setFilterCidade(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Filtro
                            </button>
                          )}
                        </div>
                      )}
                    </th>

                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>Volumes</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "volumes" ? null : "volumes")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${filterVolumes ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "volumes" && (
                        <div className="absolute left-4 top-full mt-1 w-40 rounded-xl p-2 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-2 py-1 mb-1 border-b" style={{ borderColor: "var(--border)" }}>Filtrar Volumes</div>
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 font-mono">
                            {Array.from(new Set(notas.map(n => n.volumes))).filter(v => v !== null && v !== undefined).sort((a: any, b: any) => a - b).map((vol: any) => (
                              <button key={vol} onClick={() => { setFilterVolumes(String(vol)); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">
                                {vol}
                              </button>
                            ))}
                          </div>
                          {filterVolumes && (
                            <button onClick={() => { setFilterVolumes(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Filtro
                            </button>
                          )}
                        </div>
                      )}
                    </th>
                    
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>Peso</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "peso" ? null : "peso")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${filterPeso ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "peso" && (
                        <div className="absolute left-4 top-full mt-1 w-48 rounded-xl p-2 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-2 py-1 mb-1 border-b" style={{ borderColor: "var(--border)" }}>Filtrar Peso</div>
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 font-mono">
                            {Array.from(new Set(notas.map(n => n.pesoBruto))).filter(p => p !== null && p !== undefined).sort((a: any, b: any) => a - b).map((p: any) => (
                              <button key={p} onClick={() => { setFilterPeso(String(p)); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors truncate">
                                {formatWeight(p)}
                              </button>
                            ))}
                          </div>
                          {filterPeso && (
                            <button onClick={() => { setFilterPeso(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Filtro
                            </button>
                          )}
                        </div>
                      )}
                    </th>
                    
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>Emissão</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "emissao" ? null : "emissao")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${filterDataEmissao ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "emissao" && (
                        <div className="absolute right-4 md:left-4 top-full mt-1 w-56 rounded-xl p-3 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-1 py-1 mb-2 border-b" style={{ borderColor: "var(--border)" }}>Filtrar Emissão</div>
                          
                          <div className="flex flex-col gap-1.5 mb-2">
                            <span className="text-[10px] text-gray-400">Selecionar data:</span>
                            <input 
                              type="date" 
                              value={filterDataEmissao}
                              onChange={(e) => { 
                                setFilterDataEmissao(e.target.value); 
                                setOpenDropdown(null);
                                setPage(1); 
                              }}
                              className="w-full px-2 py-1.5 rounded-lg outline-none text-xs border"
                              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                            />
                          </div>

                          <div className="text-[10px] text-gray-400 mb-1 border-t pt-1.5" style={{ borderColor: "var(--border)" }}>Datas na página:</div>
                          <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5 font-mono">
                            {Array.from(new Set(notas.map(n => {
                              const d = new Date(n.dataEmissao);
                              return typeof n.dataEmissao === "string" ? n.dataEmissao.split('T')[0] : d.toISOString().split('T')[0];
                            }))).filter(Boolean).map((dt: any) => (
                              <button key={dt} onClick={() => { setFilterDataEmissao(dt); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">
                                {formatDate(dt)}
                              </button>
                            ))}
                          </div>
                          {filterDataEmissao && (
                            <button onClick={() => { setFilterDataEmissao(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Filtro
                            </button>
                          )}
                        </div>
                      )}
                    </th>

                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>Agendamento</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "agendamento" ? null : "agendamento")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${filterDataAgendada ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "agendamento" && (
                        <div className="absolute right-4 md:left-4 top-full mt-1 w-56 rounded-xl p-3 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-1 py-1 mb-2 border-b" style={{ borderColor: "var(--border)" }}>Filtrar Agendamento</div>
                          
                          <div className="flex flex-col gap-1.5 mb-2">
                            <span className="text-[10px] text-gray-400">Selecionar data:</span>
                            <input 
                              type="date" 
                              value={filterDataAgendada}
                              onChange={(e) => { 
                                setFilterDataAgendada(e.target.value); 
                                setOpenDropdown(null);
                                setPage(1); 
                              }}
                              className="w-full px-2 py-1.5 rounded-lg outline-none text-xs border"
                              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                            />
                          </div>

                          <div className="text-[10px] text-gray-400 mb-1 border-t pt-1.5" style={{ borderColor: "var(--border)" }}>Datas na página:</div>
                          <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5 font-mono">
                            {Array.from(new Set(notas.map(n => {
                              if (!n.entrega?.dataAgendada) return null;
                              const d = new Date(n.entrega.dataAgendada);
                              return typeof n.entrega.dataAgendada === "string" ? n.entrega.dataAgendada.split('T')[0] : d.toISOString().split('T')[0];
                            }))).filter(Boolean).map((dt: any) => (
                              <button key={dt} onClick={() => { setFilterDataAgendada(dt); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">
                                {formatDate(dt)}
                              </button>
                            ))}
                          </div>
                          {filterDataAgendada && (
                            <button onClick={() => { setFilterDataAgendada(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Filtro
                            </button>
                          )}
                        </div>
                      )}
                    </th>

                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>Chegada</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "chegada" ? null : "chegada")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${filterDataChegada ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "chegada" && (
                        <div className="absolute right-4 md:left-4 top-full mt-1 w-56 rounded-xl p-3 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-1 py-1 mb-2 border-b" style={{ borderColor: "var(--border)" }}>Filtrar Chegada</div>
                          
                          <div className="flex flex-col gap-1.5 mb-2">
                            <span className="text-[10px] text-gray-400">Selecionar data:</span>
                            <input 
                              type="date" 
                              value={filterDataChegada}
                              onChange={(e) => { 
                                setFilterDataChegada(e.target.value); 
                                setOpenDropdown(null);
                                setPage(1); 
                              }}
                              className="w-full px-2 py-1.5 rounded-lg outline-none text-xs border"
                              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                            />
                          </div>

                          <div className="text-[10px] text-gray-400 mb-1 border-t pt-1.5" style={{ borderColor: "var(--border)" }}>Datas na página:</div>
                          <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5 font-mono">
                            {Array.from(new Set(notas.map(n => {
                              if (!n.entrega?.dataChegada) return null;
                              const d = new Date(n.entrega.dataChegada);
                              return typeof n.entrega.dataChegada === "string" ? n.entrega.dataChegada.split('T')[0] : d.toISOString().split('T')[0];
                            }))).filter(Boolean).map((dt: any) => (
                              <button key={dt} onClick={() => { setFilterDataChegada(dt); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">
                                {formatDate(dt)}
                              </button>
                            ))}
                          </div>
                          {filterDataChegada && (
                            <button onClick={() => { setFilterDataChegada(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Filtro
                            </button>
                          )}
                        </div>
                      )}
                    </th>
                    
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>Entrega</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "entrega" ? null : "entrega")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${filterDataEntrega ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "entrega" && (
                        <div className="absolute right-4 md:left-4 top-full mt-1 w-56 rounded-xl p-3 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-1 py-1 mb-2 border-b" style={{ borderColor: "var(--border)" }}>Filtrar Entrega</div>
                          
                          <div className="flex flex-col gap-1.5 mb-2">
                            <span className="text-[10px] text-gray-400">Selecionar data:</span>
                            <input 
                              type="date" 
                              value={filterDataEntrega}
                              onChange={(e) => { 
                                setFilterDataEntrega(e.target.value); 
                                setOpenDropdown(null);
                                setPage(1); 
                              }}
                              className="w-full px-2 py-1.5 rounded-lg outline-none text-xs border"
                              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                            />
                          </div>

                          <div className="text-[10px] text-gray-400 mb-1 border-t pt-1.5" style={{ borderColor: "var(--border)" }}>Datas na página:</div>
                          <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5 font-mono">
                            {Array.from(new Set(notas.map(n => {
                              if (!n.entrega?.dataEntrega) return null;
                              const d = new Date(n.entrega.dataEntrega);
                              return typeof n.entrega.dataEntrega === "string" ? n.entrega.dataEntrega.split('T')[0] : d.toISOString().split('T')[0];
                            }))).filter(Boolean).map((dt: any) => (
                              <button key={dt} onClick={() => { setFilterDataEntrega(dt); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">
                                {formatDate(dt)}
                              </button>
                            ))}
                          </div>
                          {filterDataEntrega && (
                            <button onClick={() => { setFilterDataEntrega(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Filtro
                            </button>
                          )}
                        </div>
                      )}
                    </th>
                    
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono relative"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-1.5">
                        <span>Status</span>
                        <button onClick={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
                          className={`hover:text-white transition-colors p-0.5 rounded ${filterStatus ? "text-blue-400" : "text-gray-500"}`}>
                          <Filter size={10} />
                        </button>
                      </div>
                      {openDropdown === "status" && (
                        <div className="absolute right-4 top-full mt-1 w-48 rounded-xl p-2 z-50 text-xs shadow-2xl border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                          <div className="font-semibold px-2 py-1 mb-1 border-b" style={{ borderColor: "var(--border)" }}>Filtrar Status</div>
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 font-sans">
                            {Object.entries(STATUS_LABELS).map(([k, v]) => (
                              <button key={k} onClick={() => { setFilterStatus(k); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">
                                {v}
                              </button>
                            ))}
                          </div>
                          {filterStatus && (
                            <button onClick={() => { setFilterStatus(""); setOpenDropdown(null); setPage(1); }}
                              className="w-full mt-2 pt-2 border-t text-center hover:underline text-red-400" style={{ borderColor: "var(--border)" }}>
                              Limpar Filtro
                            </button>
                          )}
                        </div>
                      )}
                    </th>

                    <th className="text-center px-2 py-3 text-[10px] uppercase tracking-widest font-normal font-mono w-12"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                      Ver
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {notas.map((n) => (
                    <tr key={n.id} style={{ borderBottom: "1px solid var(--border)" }}
                      className="transition-colors hover:bg-[#162030]">
                      <td className="px-4 py-3 cursor-pointer group" onClick={() => { setSearch(n.numero); setPage(1); }}>
                        <div className="font-mono text-sm font-semibold group-hover:underline group-hover:text-blue-400 transition-colors" style={{ color: "var(--accent)" }}>NF {n.numero}</div>
                        {n.serie && <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>Série {n.serie}</div>}
                      </td>
                      <td className="px-4 py-3 cursor-pointer group max-w-[180px]" onClick={() => { setFilterEmitente(n.emitenteRazao); setPage(1); }}>
                        <div className="text-sm font-medium group-hover:underline group-hover:text-blue-400 transition-colors truncate" title={n.emitenteRazao}>{n.emitenteRazao}</div>
                      </td>
                      <td className="px-4 py-3 text-sm cursor-pointer hover:underline hover:text-blue-400 transition-colors max-w-[180px]"
                        onClick={() => { setFilterDestinatario(n.destinatarioRazao); setPage(1); }}>
                        <div className="truncate" title={n.destinatarioRazao}>{n.destinatarioRazao}</div>
                      </td>
                      <td className="px-4 py-3 text-xs cursor-pointer hover:underline hover:text-blue-400 transition-colors max-w-[140px] whitespace-nowrap"
                        onClick={() => { setFilterCidade(n.cidade); setPage(1); }}
                        style={{ color: "var(--text2)" }}>
                        <div className="truncate" title={`${n.cidade}${n.uf ? ` - ${n.uf}` : ""}`}>{n.cidade}{n.uf ? ` — ${n.uf}` : ""}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs cursor-pointer hover:underline hover:text-blue-400 transition-colors"
                        onClick={() => { setFilterVolumes(String(n.volumes)); setPage(1); }}>
                        {n.volumes}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs cursor-pointer hover:underline hover:text-blue-400 transition-colors"
                        onClick={() => { setFilterPeso(String(n.pesoBruto)); setPage(1); }}>
                        {formatWeight(n.pesoBruto)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs cursor-pointer hover:underline hover:text-blue-400 transition-colors"
                        onClick={() => {
                          const d = new Date(n.dataEmissao);
                          const dateStr = typeof n.dataEmissao === "string" ? n.dataEmissao.split('T')[0] : d.toISOString().split('T')[0];
                          setFilterDataEmissao(dateStr);
                          setPage(1);
                        }}
                        style={{ color: "var(--text3)" }}>
                        {formatDate(n.dataEmissao)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs cursor-pointer hover:underline hover:text-blue-400 transition-colors"
                        onClick={() => {
                          if (n.entrega?.dataAgendada) {
                            const d = new Date(n.entrega.dataAgendada);
                            const dateStr = typeof n.entrega.dataAgendada === "string" ? n.entrega.dataAgendada.split('T')[0] : d.toISOString().split('T')[0];
                            setFilterDataAgendada(dateStr);
                            setPage(1);
                          }
                        }}
                        style={{ color: "var(--text3)" }}>
                        {n.entrega?.dataAgendada ? formatDate(n.entrega.dataAgendada) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs cursor-pointer hover:underline hover:text-blue-400 transition-colors"
                        onClick={() => {
                          if (n.entrega?.dataChegada) {
                            const d = new Date(n.entrega.dataChegada);
                            const dateStr = typeof n.entrega.dataChegada === "string" ? n.entrega.dataChegada.split('T')[0] : d.toISOString().split('T')[0];
                            setFilterDataChegada(dateStr);
                            setPage(1);
                          }
                        }}
                        style={{ color: "var(--text3)" }}>
                        {n.entrega?.dataChegada ? formatDate(n.entrega.dataChegada) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {n.entrega ? (
                          <div>
                            <div className="font-mono text-[10px]" style={{ color: "var(--text3)" }}>
                              {n.entrega.notas && n.entrega.notas.length > 0 ? n.entrega.notas.map((nt: any) => nt.numero).join(", ") : n.entrega.codigo}
                            </div>
                            {n.entrega.dataEntrega && (
                              <div className="text-[10px] cursor-pointer hover:underline hover:text-blue-400" 
                                onClick={() => {
                                  const d = new Date(n.entrega.dataEntrega);
                                  const dateStr = typeof n.entrega.dataEntrega === "string" ? n.entrega.dataEntrega.split('T')[0] : d.toISOString().split('T')[0];
                                  setFilterDataEntrega(dateStr);
                                  setPage(1);
                                }}>
                                Entregue: {formatDate(n.entrega.dataEntrega)}
                              </div>
                            )}
                            {n.entrega.motorista?.nome && <div className="text-[10px]" style={{ color: "var(--text2)" }}>
                              🚛 {n.entrega.motorista.nome}
                            </div>}
                          </div>
                        ) : <span className="text-[10px]" style={{ color: "var(--text3)" }}>Aguardando</span>}
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => { setFilterStatus(n.entrega ? n.entrega.status : "PROGRAMADO"); setPage(1); }}>
                        {n.entrega ? (
                          <div>
                            <StatusBadge status={n.entrega.status} />
                            {n.entrega.status === "OCORRENCIA" && n.entrega.ocorrencias?.length > 0 && (
                              <div className="mt-1.5 p-2 rounded-lg" style={{ background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)" }}>
                                <div className="flex items-center gap-1 mb-0.5">
                                  <AlertTriangle size={10} className="text-red-500" />
                                  <span className="text-[9px] font-bold uppercase text-red-500">{n.entrega.ocorrencias[0].tipo}</span>
                                </div>
                                <p className="text-[11px] leading-tight" style={{ color: "var(--text2)" }}>{n.entrega.ocorrencias[0].descricao}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="badge badge-PROGRAMADO">Programado</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetalheNota(n); }}
                          className="p-2 rounded-lg hover:bg-blue-600 hover:text-white transition-all"
                          style={{ background: "var(--surface2)", color: "var(--text2)" }}
                          title="Ver detalhes completos"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>Página {page} de {pages} · {total} registros</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
                      className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-30 transition-all hover:opacity-70"
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)" }}>
                      <ChevronLeft size={14} />
                    </button>
                    <button onClick={() => setPage((p) => p + 1)} disabled={page === pages}
                      className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-30 transition-all hover:opacity-70"
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)" }}>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {detalheNota && <DetalheNotaModal nota={detalheNota} onClose={() => setDetalheNota(null)} />}
    </div>
  );
}

function DetalheNotaModal({ nota, onClose }: { nota: any; onClose: () => void }) {
  const e = nota.entrega;
  const ocorrenciaAberta = e?.ocorrencias?.find((o: any) => !o.resolvida);

  function formatCnpjLocal(c: string) {
    if (!c) return "—";
    const d = c.replace(/\D/g, "");
    if (d.length !== 14) return c;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  function formatMoney(v?: number) {
    if (v == null) return "—";
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 px-6 py-4 flex items-center justify-between border-b" style={{ background: "var(--surface)", borderColor: "var(--border)", zIndex: 10 }}>
          <div>
            <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "var(--text3)" }}>Detalhes da Nota Fiscal</div>
            <div className="text-xl font-bold font-mono" style={{ color: "var(--accent)" }}>NF {nota.numero}{nota.serie ? ` · Série ${nota.serie}` : ""}</div>
          </div>
          <div className="flex items-center gap-3">
            {e?.status && <StatusBadge status={e.status} />}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Ocorrência destacada */}
          {ocorrenciaAberta && (
            <div className="rounded-xl p-4" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)" }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-red-500" />
                <span className="text-sm font-bold text-red-500">Ocorrência: {ocorrenciaAberta.tipo}</span>
              </div>
              <p className="text-sm" style={{ color: "var(--text2)" }}>{ocorrenciaAberta.descricao}</p>
              {ocorrenciaAberta.createdAt && (
                <p className="text-[11px] mt-2" style={{ color: "var(--text3)" }}>
                  Registrada em {new Date(ocorrenciaAberta.createdAt).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          )}

          {/* Emitente */}
          <Section icon={Building2} title="Emitente">
            <div className="text-sm font-medium">{nota.emitenteRazao}</div>
            <div className="text-xs font-mono mt-1" style={{ color: "var(--text3)" }}>CNPJ: {formatCnpjLocal(nota.emitenteCnpj)}</div>
          </Section>

          {/* Destinatário */}
          <Section icon={MapPin} title="Destinatário">
            <div className="text-sm font-medium">{nota.destinatarioRazao}</div>
            <div className="text-xs font-mono mt-1" style={{ color: "var(--text3)" }}>CNPJ: {formatCnpjLocal(nota.destinatarioCnpj)}</div>
            <div className="text-xs mt-2" style={{ color: "var(--text2)" }}>
              {[nota.endereco, nota.bairro, nota.cidade, nota.uf, nota.cep].filter(Boolean).join(" · ")}
            </div>
          </Section>

          {/* Dados da nota */}
          <Section icon={FileText} title="Dados da Nota">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Info label="Volumes" value={nota.volumes ?? "—"} />
              <Info label="Peso Bruto" value={formatWeight(nota.pesoBruto)} />
              <Info label="Valor da Nota" value={formatMoney(nota.valorNota)} />
              <Info label="Emissão" value={formatDate(nota.dataEmissao)} />
              {nota.chaveAcesso && (
                <div className="col-span-2 sm:col-span-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--text3)" }}>Chave de Acesso</div>
                  <div className="text-[11px] font-mono break-all" style={{ color: "var(--text2)" }}>{nota.chaveAcesso}</div>
                </div>
              )}
            </div>
          </Section>

          {/* Entrega */}
          {e ? (
            <>
              <Section icon={Truck} title="Entrega">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <Info label="Código" value={e.codigo} mono />
                  <Info label="Motorista" value={e.motorista?.nome || "—"} />
                  {e.notas && e.notas.length > 1 && (
                    <Info label="NFs nesta carga" value={e.notas.map((nt: any) => nt.numero).join(", ")} mono />
                  )}
                </div>
              </Section>

              <Section icon={Calendar} title="Datas">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <Info label="Chegada no CD" value={e.dataChegada ? formatDate(e.dataChegada) : "—"} mono />
                  <Info label="Agendamento" value={e.dataAgendada ? formatDate(e.dataAgendada) : "—"} mono />
                  <Info label="Entrega" value={e.dataEntrega ? formatDate(e.dataEntrega) : "—"} mono color={e.dataEntrega ? "#059669" : undefined} />
                </div>
              </Section>
            </>
          ) : (
            <Section icon={Clock} title="Entrega">
              <div className="text-sm" style={{ color: "var(--text3)" }}>Aguardando vinculação à entrega.</div>
            </Section>
          )}
        </div>

        <div className="sticky bottom-0 px-6 py-3 border-t flex justify-end" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text2)" }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} style={{ color: "var(--accent)" }} />
        <h3 className="text-xs uppercase tracking-widest font-bold font-mono" style={{ color: "var(--text2)" }}>{title}</h3>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function Info({ label, value, mono, color }: { label: string; value: any; mono?: boolean; color?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text3)" }}>{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`} style={{ color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}
