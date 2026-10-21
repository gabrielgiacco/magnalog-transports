import { prisma } from "@/lib/prisma";
import { requireSessaoImpressao } from "@/lib/imprimir-auth";
import { notFound } from "next/navigation";
import CodigoBarras from "./CodigoBarras";

const TIPO_LABEL: Record<string, string> = {
  FALTA: "FALTA",
  SOBRA: "SOBRA",
  AVARIA: "AVARIA",
  INVERSAO: "INVERSÃO",
  DEVOLUCAO: "DEVOLUÇÃO",
  SEM_PEDIDO: "SEM PEDIDO",
};
const TIPO_CURTO: Record<string, string> = {
  FALTA: "FALTA",
  SOBRA: "SOBRA",
  AVARIA: "AVARIA",
  INVERSAO: "INVERS.",
  DEVOLUCAO: "DEVOL.",
  SEM_PEDIDO: "S/ PED.",
};

type Nf = {
  numero: string;
  serie: string | null;
  chaveAcesso: string | null;
  emitenteRazao: string;
  emitenteCnpj: string;
  destinatarioRazao: string;
};
type Linha = {
  codigoProduto: string;
  descricao: string;
  unidade: string | null;
  quantidadeAvaria: number;
  tipoDivergencia: string | null;
  invertidoCodigo: string | null;
  invertidoDescricao: string | null;
  invertidoQuantidade: number | null;
};
type Dados = { nf: Nf | null; linhas: Linha[]; nfd?: { valor: number } };
type Cabecalho = {
  codigo: string;
  tipo: string;
  data: string;
  destinatarioFallback: string;
  chegada: string[];
};

const formatCnpj = (v: string) => {
  const s = (v || "").replace(/\D/g, "");
  return s.length === 14 ? s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : v;
};
const qtd = (n: number) => String(Number(n.toFixed(3)));
const grupos4 = (c: string) => c.replace(/(\d{4})(?=\d)/g, "$1 ");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Uma etiqueta (~95 x 135 mm)
function Etiqueta({ cab, dados }: { cab: Cabecalho; dados: Dados }) {
  const { nf, linhas, nfd } = dados;
  const chave = nf?.chaveAcesso && /^\d{44}$/.test(nf.chaveAcesso) ? nf.chaveAcesso : null;
  const miudo = linhas.length > 8;
  const destinatario = nf?.destinatarioRazao || cab.destinatarioFallback;

  return (
    <div className="etq">
      <div className="topo">
        <span className="avr">{cab.codigo}</span>
        <span className="tipo">
          <b>{TIPO_LABEL[cab.tipo] || cab.tipo}</b>
          <br />
          {cab.data}
        </span>
      </div>

      {nfd && <div className="box"><b>NF DE DEVOLUÇÃO</b> · valor {brl(nfd.valor)}</div>}
      {nf && (
        <div className="box">
          <b>NF-e nº {nf.numero}</b> &nbsp; Série: {nf.serie || "-"}
          <br />
          <b>{nfd ? "EMITENTE:" : "FORNECEDOR:"}</b> {nf.emitenteRazao} · {formatCnpj(nf.emitenteCnpj)}
        </div>
      )}

      {chave && (
        <div className="box" style={{ textAlign: "center" }}>
          <CodigoBarras valor={chave} />
          <div className="chave">{grupos4(chave)}</div>
        </div>
      )}

      {linhas.length > 0 && (
        <div className="box" style={{ fontSize: miudo ? "7.5px" : undefined }}>
          <b>PRODUTOS AFETADOS</b>
          <table className="prod">
            <thead>
              <tr><th>Cód</th><th>Descrição</th><th>Qtd</th><th>UN</th><th>Tipo</th></tr>
            </thead>
            <tbody>
              {linhas.map((p, i) => {
                const t = p.tipoDivergencia || cab.tipo;
                return [
                  <tr key={i}>
                    <td>{p.codigoProduto}</td>
                    <td>{p.descricao}</td>
                    <td>{qtd(p.quantidadeAvaria)}</td>
                    <td>{p.unidade || ""}</td>
                    <td>{TIPO_CURTO[t] || t}</td>
                  </tr>,
                  t === "INVERSAO" && p.invertidoDescricao ? (
                    <tr key={`i${i}`}>
                      <td colSpan={5} className="inv">
                        ↳ veio no lugar: {p.invertidoDescricao}
                        {p.invertidoCodigo ? ` (${p.invertidoCodigo})` : ""}
                        {p.invertidoQuantidade != null ? ` ${qtd(p.invertidoQuantidade)}` : ""}
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {destinatario && (
        <div className="box"><b>DESTINATÁRIO:</b> {destinatario}</div>
      )}
      {cab.chegada.length > 0 && (
        <div className="box"><b>CHEGADA:</b> {cab.chegada.join(" · ")}</div>
      )}

      <div className="rodape">MAGNA LOG — NÃO REMOVER ATÉ A RESOLUÇÃO DA AVARIA</div>
    </div>
  );
}

const CSS = `
  body { margin: 0; padding: 56px 0 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  .folha { width: 194mm; margin: 0 auto 8mm; display: grid; grid-template-columns: 95mm 95mm; grid-auto-rows: 135mm; gap: 4mm; }
  .etq { box-sizing: border-box; border: 1px solid #000; outline: 1px dashed #999; outline-offset: 1px; padding: 3mm; font-size: 9px; line-height: 1.25; overflow: hidden; display: flex; flex-direction: column; gap: 4px; }
  .topo { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #000; padding-bottom: 3px; }
  .avr { font-size: 20px; font-weight: bold; }
  .tipo { text-align: right; font-size: 10px; }
  .box { border: 1px solid #000; padding: 2px 4px; word-break: break-word; }
  .chave { font-family: "Courier New", monospace; font-size: 8px; margin-top: 2px; }
  .prod { width: 100%; border-collapse: collapse; margin-top: 2px; }
  .prod th, .prod td { text-align: left; vertical-align: top; padding: 1px 2px; border-bottom: 1px dotted #999; }
  .prod td:nth-child(2) { word-break: break-word; }
  .inv { font-style: italic; padding-left: 8px; }
  .rodape { margin-top: auto; text-align: center; font-weight: bold; font-size: 8px; }
  .no-print-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 999; background: #f3f4f6; border-bottom: 1px solid #ccc; padding: 8px 12px; display: flex; gap: 14px; align-items: center; font-size: 13px; }
  .no-print-bar form { margin: 0; }
  .btn-print { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.15); font-family: Arial, sans-serif; }
  .btn-print:hover { background: #1d4ed8; }
  @media print {
    @page { size: A4 portrait; margin: 8mm; }
    body { padding: 0; }
    .no-print-bar { display: none !important; }
    .folha { margin: 0 auto; page-break-after: always; break-after: page; display: grid !important; }
    .folha:last-child { page-break-after: auto; break-after: auto; }
    .topo { display: flex !important; }
  }
`;

export default async function EtiquetaAvariaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { copias?: string };
}) {
  await requireSessaoImpressao();
  const avaria = await prisma.avaria.findUnique({
    where: { id: params.id },
    include: {
      notaFiscal: true,
      produtos: { orderBy: { createdAt: "asc" }, include: { notaFiscal: true } },
      entrega: {
        select: { razaoSocial: true, cidade: true, uf: true, notas: { take: 1 } },
      },
      devolucoes: true,
    },
  });
  if (!avaria) return notFound();

  const copias = Math.min(20, Math.max(1, parseInt(searchParams.copias || "1", 10) || 1));
  const nfPadrao: Nf | null = avaria.notaFiscal ?? avaria.entrega?.notas[0] ?? null;

  // Monta as etiquetas: por NF dos produtos, por NFD, ou uma unica
  let base: Dados[] = [];
  if (avaria.produtos.length > 0) {
    const mapa = new Map<string, Dados>();
    for (const p of avaria.produtos) {
      const nf: Nf | null = p.notaFiscal ?? nfPadrao;
      const chave = nf ? nf.chaveAcesso || nf.numero : "sem-nf";
      if (!mapa.has(chave)) mapa.set(chave, { nf, linhas: [] });
      mapa.get(chave)!.linhas.push(p);
    }
    base = Array.from(mapa.values());
  } else if (avaria.devolucoes.length > 0) {
    base = avaria.devolucoes.map((d) => ({
      nf: {
        numero: d.numero,
        serie: d.serie,
        chaveAcesso: d.chaveAcesso,
        emitenteRazao: d.emitenteRazao,
        emitenteCnpj: d.emitenteCnpj,
        destinatarioRazao: d.destinatarioRazao,
      },
      linhas: [],
      nfd: { valor: d.valorNota },
    }));
  } else {
    base = [{ nf: nfPadrao, linhas: [] }];
  }
  const etiquetas = base.flatMap((d) => Array.from({ length: copias }, () => d));

  const e = avaria.entrega;
  const cab: Cabecalho = {
    codigo: avaria.codigo,
    tipo: avaria.tipo,
    data: avaria.dataOcorrencia.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
    destinatarioFallback: e ? [e.razaoSocial, [e.cidade, e.uf].filter(Boolean).join("/")].filter(Boolean).join(" — ") : "",
    chegada: [avaria.transportadoraChegada, avaria.motoristaChegada, avaria.placaChegada].filter(
      (v): v is string => !!v
    ),
  };

  // Folhas de ate 4 etiquetas
  const folhas: Dados[][] = [];
  for (let i = 0; i < etiquetas.length; i += 4) folhas.push(etiquetas.slice(i, i + 4));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="no-print-bar no-print">
        <b>Etiquetas da {avaria.codigo} — {etiquetas.length} etiqueta(s)</b>
        <form method="get">
          <label>
            Cópias por etiqueta:{" "}
            <select name="copias" defaultValue={String(Math.min(copias, 10))} id="sel-copias">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </form>
        <button id="btn-print-etiqueta" className="btn-print">Imprimir</button>
      </div>

      {folhas.map((folha, fi) => (
        <div key={fi} className="folha">
          {folha.map((d, i) => (
            <Etiqueta key={i} cab={cab} dados={d} />
          ))}
        </div>
      ))}

      <script dangerouslySetInnerHTML={{ __html: `
        const btn = document.getElementById("btn-print-etiqueta");
        if (btn) btn.onclick = function() { window.print(); };
        const sel = document.getElementById("sel-copias");
        if (sel) sel.onchange = function() { sel.form.submit(); };
      ` }} />
    </>
  );
}
