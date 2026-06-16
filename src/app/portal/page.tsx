"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loading, StatusBadge } from "@/components/ui";
import { formatDate, formatWeight } from "@/lib/utils";
import { Search, LogOut, FileText, ChevronLeft, ChevronRight, Package, AlertTriangle, Filter, X } from "lucide-react";


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
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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
    
    const res = await fetch(`/api/portal?${params}`, { cache: "no-store" });
    const data = await res.json();
    setNotas(data.notas || []);
    setTotal(data.total || 0);
    setPages(data.pages || 1);
    setStats(data.stats || { EM_SEPARACAO: 0, OCORRENCIA: 0, FINALIZADAS: 0, EM_ROTA: 0 });
    setLoading(false);
  }, [page, debouncedSearch, filterStatus, filterEmitente, filterCidade, filterDataEmissao]);

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
        {(filterEmitente || filterCidade || filterDataEmissao) && (
          <div className="flex flex-wrap gap-2 mb-5 items-center">
            <span className="text-xs" style={{ color: "var(--text3)" }}>Filtros ativos:</span>
            {filterEmitente && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Emitente: {filterEmitente}</span>
                <button onClick={() => { setFilterEmitente(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterCidade && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Cidade: {filterCidade}</span>
                <button onClick={() => { setFilterCidade(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            {filterDataEmissao && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text)" }}>
                <span>Emissão: {formatDate(filterDataEmissao)}</span>
                <button onClick={() => { setFilterDataEmissao(""); setPage(1); }} className="hover:opacity-70 text-blue-400"><X size={10} /></button>
              </span>
            )}
            <button onClick={() => { setFilterEmitente(""); setFilterCidade(""); setFilterDataEmissao(""); setPage(1); }} className="text-xs hover:underline ml-2" style={{ color: "var(--text3)" }}>Limpar todos</button>
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
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>NF / Série</th>
                    
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
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
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

                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Destinatário</th>
                    
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
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
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

                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Volumes</th>
                    
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Peso</th>
                    
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
                          <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5">
                            {Array.from(new Set(notas.map(n => {
                              const d = new Date(n.dataEmissao);
                              return typeof n.dataEmissao === "string" ? n.dataEmissao.split('T')[0] : d.toISOString().split('T')[0];
                            }))).filter(Boolean).map((dt: any) => (
                              <button key={dt} onClick={() => { setFilterDataEmissao(dt); setOpenDropdown(null); setPage(1); }}
                                className="w-full text-left px-2 py-1 rounded-lg hover:bg-blue-600 hover:text-white transition-colors font-mono">
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

                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Chegada</th>
                    
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Entrega</th>
                    
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-normal font-mono"
                      style={{ color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {notas.map((n) => (
                    <tr key={n.id} style={{ borderBottom: "1px solid var(--border)" }}
                      className="transition-colors hover:bg-[#162030]">
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm font-semibold" style={{ color: "var(--accent)" }}>NF {n.numero}</div>
                        {n.serie && <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>Série {n.serie}</div>}
                      </td>
                      <td className="px-4 py-3 cursor-pointer group" onClick={() => { setFilterEmitente(n.emitenteRazao); setPage(1); }}>
                        <div className="text-sm font-medium group-hover:underline group-hover:text-blue-400 transition-colors">{n.emitenteRazao}</div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text3)" }}>{n.emitenteCnpj}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{n.destinatarioRazao}</td>
                      <td className="px-4 py-3 text-xs cursor-pointer hover:underline hover:text-blue-400 transition-colors"
                        onClick={() => { setFilterCidade(n.cidade); setPage(1); }}
                        style={{ color: "var(--text2)" }}>
                        {n.cidade}{n.uf ? ` — ${n.uf}` : ""}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{n.volumes}</td>
                      <td className="px-4 py-3 font-mono text-xs">{formatWeight(n.pesoBruto)}</td>
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
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text3)" }}>
                        {n.entrega?.dataChegada ? formatDate(n.entrega.dataChegada) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {n.entrega ? (
                          <div>
                            <div className="font-mono text-[10px]" style={{ color: "var(--text3)" }}>
                              {n.entrega.notas && n.entrega.notas.length > 0 ? n.entrega.notas.map((nt: any) => nt.numero).join(", ") : n.entrega.codigo}
                            </div>
                            {n.entrega.dataAgendada && <div className="text-[10px]" style={{ color: "var(--text2)" }}>Ag.: {formatDate(n.entrega.dataAgendada)}</div>}
                            {n.entrega.dataEntrega && <div className="text-[10px]" style={{ color: "#10b981" }}>Entregue: {formatDate(n.entrega.dataEntrega)}</div>}
                            {n.entrega.motorista?.nome && <div className="text-[10px]" style={{ color: "var(--text2)" }}>🚛 {n.entrega.motorista.nome}</div>}
                          </div>
                        ) : <span className="text-[10px]" style={{ color: "var(--text3)" }}>Aguardando</span>}
                      </td>
                      <td className="px-4 py-3">
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
    </div>
  );
}
