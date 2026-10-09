import { requireSessaoImpressao } from "@/lib/imprimir-auth";
import {
  lerFiltrosChecklist, montarChecklist, opcoesDoDia, SEM_MOTORISTA,
  type CargaChecklist,
} from "@/lib/checklist-carregamento";

const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const isoParaBR = (iso: string) => iso.split("-").reverse().join("/");

const NOTA_PALETES: Record<string, string> = {
  norma: "pela norma",
  parcial: "parcial — item sem norma",
  "sem norma": "sem norma",
};

function Paletes({ c }: { c: CargaChecklist }) {
  const semDado = c.origemPaletes === "sem norma" && c.paletes === 0;
  return (
    <>
      {semDado ? "—" : num(c.paletes)}
      {c.origemPaletes !== "informado" && <div className="nota">{NOTA_PALETES[c.origemPaletes]}</div>}
    </>
  );
}

export default async function ChecklistCarregamentoPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await requireSessaoImpressao();

  // Os filtros repetem o parametro: anexa todos os valores
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.append(k, v);
  }
  const filtros = lerFiltrosChecklist(sp);
  const [blocos, opcoes] = await Promise.all([montarChecklist(filtros), opcoesDoDia(filtros.data)]);

  const nomeMotorista = (id: string) =>
    id === SEM_MOTORISTA ? "Sem motorista" : opcoes.motoristas.find((m) => m.valor === id)?.rotulo || id;
  const partesFiltro = [
    filtros.fornecedores.length ? `Fornecedor: ${filtros.fornecedores.join(", ")}` : "",
    filtros.motoristas.length ? `Motorista: ${filtros.motoristas.map(nomeMotorista).join(", ")}` : "",
    filtros.clientes.length ? `Cliente: ${filtros.clientes.join(", ")}` : "",
    filtros.cidades.length ? `Cidade: ${filtros.cidades.join(", ")}` : "",
  ].filter(Boolean);

  // Data da agenda (meia-noite UTC) e momento da emissao no fuso do CD
  const [a, m, d] = filtros.data.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
  const agora = new Date();
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...o });
  const hhmm = fmt({ hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", "");
  const numeroDoc = `CRG-${filtros.data.replace(/-/g, "")}-${hhmm}`;
  const emitidoEm = fmt({ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const emitente = session.user?.name || "—";

  const cargas = blocos.flatMap((b) => b.cargas);
  const totalNfs = cargas.reduce((s, c) => s + c.nfs.length, 0);
  const veiculos = blocos.filter((b) => b.placa || b.motorista).length;
  const resumo: [string, string][] = [
    ["Cargas", String(cargas.length)],
    ["NFs", String(totalNfs)],
    ["Veículos", String(veiculos)],
    ["Paletes", num(blocos.reduce((s, b) => s + b.paletes, 0))],
    ["Volumes", num(blocos.reduce((s, b) => s + b.volumes, 0))],
    ["Peso (kg)", num(blocos.reduce((s, b) => s + b.pesoKg, 0))],
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        body { font-family: Arial, Helvetica, sans-serif; color: #000; padding: 20px 24px; margin: 0; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .header { display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 6px; }
        .logo { width: 110px; height: auto; }
        .company { flex: 1; text-align: center; }
        .company-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; }
        .doc-title { font-weight: bold; font-size: 13px; letter-spacing: .5px; }
        .doc-info { text-align: right; font-size: 10.5px; line-height: 1.5; }
        .filtros { font-size: 10.5px; margin-bottom: 6px; }
        .resumo { display: flex; flex-wrap: wrap; gap: 4px 28px; border: 1px solid #000; padding: 5px 10px; margin-bottom: 10px; font-size: 11px; }
        .vazio { text-align: center; margin: 60px 0; font-size: 13px; color: #444; }
        .bloco { border: 1px solid #000; margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid; }
        .bloco-head { display: flex; flex-wrap: wrap; gap: 2px 24px; align-items: baseline; background: #d1d5db; border-bottom: 1px solid #000; padding: 4px 8px; font-size: 11px; }
        .bloco-head .grow { flex: 1; }
        .alerta { color: #b91c1c; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th { background: #e5e7eb; border: 1px solid #666; padding: 3px 4px; text-align: left; font-size: 9.5px; }
        td { border: 1px solid #999; padding: 4px; vertical-align: top; word-wrap: break-word; }
        .r { text-align: right; white-space: nowrap; }
        .c { text-align: center; width: 30px; }
        .box { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; vertical-align: middle; }
        .nf { word-break: break-word; min-width: 70px; }
        .nota { font-size: 7.5px; color: #444; white-space: normal; line-height: 1.1; }
        .obs { min-width: 110px; height: 26px; }
        .obs span { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 9px; }
        tr.total td { background: #f3f4f6; font-weight: bold; border-top: 2px solid #000; }
        .rodape-bloco { display: flex; flex-direction: column; gap: 14px; padding: 8px 8px 6px; }
        .assinaturas { display: flex; gap: 30px; margin-top: 8px; }
        .assinatura { flex: 1; border-top: 1px solid #000; text-align: center; padding-top: 2px; font-size: 9.5px; }
        .doc-rodape { margin-top: 8px; font-size: 9px; color: #333; border-top: 1px solid #999; padding-top: 4px; }

        .btn-print-wrap { position: fixed; top: 12px; right: 12px; z-index: 999; }
        .btn-print { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.15); font-family: Arial, sans-serif; }
        .btn-print:hover { background: #1d4ed8; }

        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { padding: 0; }
          .no-print { display: none !important; }
          .header, .resumo, .bloco-head, .rodape-bloco, .assinaturas { display: flex !important; }
          thead { display: table-header-group !important; }
          .bloco-head, th, tr.total td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      ` }} />

      <div className="no-print btn-print-wrap">
        <button id="btn-print-checklist" className="btn-print">Imprimir / Salvar PDF</button>
      </div>

      <div className="header">
        <img src="/logo.png" alt="MAGNA LOG" className="logo" />
        <div className="company">
          <div className="company-name">MAGNA LOG TRANSPORTES LTDA</div>
          <div className="doc-title">CHECKLIST DE CARREGAMENTO</div>
        </div>
        <div className="doc-info">
          <div><b>Nº {numeroDoc}</b></div>
          <div>Agenda: {isoParaBR(filtros.data)} ({diaSemana})</div>
          <div>Emitido em {emitidoEm} por {emitente}</div>
        </div>
      </div>

      <div className="filtros">
        <b>Filtros:</b> {partesFiltro.length ? partesFiltro.join("  |  ") : "Todas as cargas do dia"}
      </div>

      <div className="resumo">
        {resumo.map(([k, v]) => <span key={k}><b>{k}:</b> {v}</span>)}
      </div>

      {blocos.length === 0 ? (
        <div className="vazio">Nenhuma carga a carregar em {isoParaBR(filtros.data)} com os filtros escolhidos.</div>
      ) : blocos.map((b, i) => {
        const acima = b.capacidadePaletes !== null && b.paletes > b.capacidadePaletes;
        return (
          <div className="bloco" key={b.chave}>
            <div className="bloco-head">
              <b>VEÍCULO {i + 1}/{blocos.length}</b>
              <span>{b.placa ? <><b>{b.placa}</b>{b.tipo ? ` — ${b.tipo}` : ""}</> : <b>Sem veículo definido</b>}</span>
              <span className="grow">
                {b.motorista ? <><b>{b.motorista}</b>{b.telefone ? ` — ${b.telefone}` : ""}</> : <b>Sem motorista</b>}
              </span>
              <span className={acima ? "alerta" : undefined}>
                Paletes: {num(b.paletes)}{b.capacidadePaletes !== null ? ` / ${b.capacidadePaletes}` : ""}
                {acima && " ⚠ acima da capacidade"}
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th className="c">Sep.</th><th className="c">Conf.</th><th className="c">Carr.</th>
                  <th>NF(s)</th><th>Cliente</th><th>Cidade/UF</th><th>Fornecedor</th>
                  <th className="r">Volumes</th><th className="r">Peso (kg)</th><th className="r">Paletes</th><th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {b.cargas.map((c) => (
                  <tr key={c.id}>
                    <td className="c"><span className="box" /></td>
                    <td className="c"><span className="box" /></td>
                    <td className="c"><span className="box" /></td>
                    <td className="nf">{c.nfs.join(", ")}</td>
                    <td>{c.cliente}</td>
                    <td>{c.cidade}{c.uf ? `/${c.uf}` : ""}</td>
                    <td>{c.fornecedores.join(", ")}</td>
                    <td className="r">{num(c.volumes)}</td>
                    <td className="r">{num(c.pesoKg)}</td>
                    <td className="r"><Paletes c={c} /></td>
                    <td className="obs"><span>{c.observacoes.slice(0, 80)}</span></td>
                  </tr>
                ))}
                <tr className="total">
                  <td colSpan={7}>Total do veículo</td>
                  <td className="r">{num(b.volumes)}</td>
                  <td className="r">{num(b.pesoKg)}</td>
                  <td className="r">{num(b.paletes)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <div className="rodape-bloco">
              <div>Início ___:___ &nbsp;&nbsp; Fim ___:___ &nbsp;&nbsp; Doca ______ &nbsp;&nbsp; Lacre __________</div>
              <div className="assinaturas">
                <div className="assinatura">Encarregado</div>
                <div className="assinatura">Conferente</div>
                <div className="assinatura">Motorista</div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="doc-rodape">Conferir NF × mercadoria antes de lacrar. Divergência: registrar em Avarias.</div>

      <script dangerouslySetInnerHTML={{ __html: `
        const btn = document.getElementById("btn-print-checklist");
        if (btn) btn.onclick = function() { window.print(); };
      ` }} />
    </>
  );
}
