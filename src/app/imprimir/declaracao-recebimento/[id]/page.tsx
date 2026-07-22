import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

const TIPO_LABEL: Record<string, string> = {
  FALTA: "FALTA",
  SOBRA: "SOBRA",
  AVARIA: "AVARIA",
  INVERSAO: "INVERSÃO",
  DEVOLUCAO: "DEVOLUÇÃO",
  SEM_PEDIDO: "SEM PEDIDO",
};

const formatCPF = (cpf: string | null | undefined) => {
  if (!cpf) return "";
  const s = String(cpf).replace(/\D/g, "");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return cpf;
};

const monthPtBr = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();

export default async function DeclaracaoRecebimentoPage({ params }: { params: { id: string } }) {
  const avaria = await prisma.avaria.findUnique({
    where: { id: params.id },
    include: {
      produtos: {
        orderBy: { createdAt: "asc" },
        include: { notaFiscal: { select: { id: true, numero: true, emitenteRazao: true, emitenteCnpj: true } } },
      },
      entrega: {
        select: {
          id: true, codigo: true, razaoSocial: true, cidade: true, uf: true,
          motorista: { select: { id: true, nome: true, cpf: true } },
          veiculo: { select: { id: true, placa: true } },
        },
      },
      notaFiscal: { select: { id: true, numero: true, emitenteRazao: true, emitenteCnpj: true } },
      motorista: { select: { id: true, nome: true, cpf: true } },
      registradoPor: { select: { id: true, name: true } },
    },
  });

  if (!avaria) return notFound();

  // Dados agregados
  const motoristaNome = avaria.motoristaChegada || avaria.motorista?.nome || avaria.entrega?.motorista?.nome || "";
  const motoristaCpf = avaria.motorista?.cpf || avaria.entrega?.motorista?.cpf || "";
  const placa = avaria.placaChegada || avaria.entrega?.veiculo?.placa || "";
  const transportadora = avaria.transportadoraChegada || "";
  const conferente = avaria.registradoPor?.name || "";

  // Fornecedor: se todos os produtos com NF têm o mesmo emitente, usa; senão "DIVERSOS"
  const fornecedoresSet = new Set(
    avaria.produtos
      .map((p) => p.notaFiscal?.emitenteRazao || avaria.notaFiscal?.emitenteRazao)
      .filter(Boolean)
  );
  const fornecedor =
    fornecedoresSet.size === 1
      ? Array.from(fornecedoresSet)[0]
      : fornecedoresSet.size > 1
        ? "DIVERSOS"
        : avaria.notaFiscal?.emitenteRazao || "";

  // Tipos presentes → marca os checkboxes
  const tiposPresentes = new Set(
    avaria.produtos
      .map((p) => p.tipoDivergencia || avaria.tipo)
      .filter(Boolean) as string[]
  );
  const has = (t: string) => tiposPresentes.has(t);
  const checkbox = (marcado: boolean) => (marcado ? "(X)" : "( )");

  const dataDoc = avaria.dataOcorrencia || avaria.createdAt || new Date();
  const dataStr = `Aparecida de Goiânia, ${dataDoc.getDate()} de ${monthPtBr(dataDoc)} de ${dataDoc.getFullYear()}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        body { font-family: "Times New Roman", Times, serif; color: #000; padding: 30px 40px; margin: 0; background: #fff; font-size: 12px; line-height: 1.45; }
        .doc { max-width: 720px; margin: 0 auto; position: relative; }
        .header { display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
        .logo { width: 130px; height: auto; }
        .company { flex: 1; text-align: center; }
        .company-name { font-weight: bold; font-size: 15px; margin-bottom: 2px; }
        .doc-title { font-style: italic; text-decoration: underline; font-weight: bold; font-size: 13px; }
        .intro { text-align: justify; margin: 14px 0 18px; }
        .field { margin-bottom: 3px; }
        .field b { font-weight: bold; }
        .divisor { border-top: 1px dashed #666; margin: 12px 0; }
        .divergencia { margin: 10px 0 14px; font-weight: bold; }
        .divergencia b { margin-right: 6px; }
        .produto-block { margin-bottom: 10px; }
        .produto-line { font-weight: bold; }
        .produto-sub { padding-left: 12px; font-weight: bold; }
        .footer-data { text-align: center; margin: 40px 0 60px; font-style: italic; }
        .assinaturas { display: flex; justify-content: space-between; gap: 40px; margin-top: 40px; }
        .ass-col { flex: 1; text-align: center; }
        .ass-line { border-top: 1px solid #000; padding-top: 4px; font-style: italic; font-size: 11px; }
        .emitido { margin-top: 40px; font-weight: bold; }

        .btn-print-wrap { position: fixed; top: 12px; right: 12px; z-index: 999; }
        .btn-print { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.15); font-family: Arial, sans-serif; }
        .btn-print:hover { background: #1d4ed8; }

        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body { padding: 0; }
          .no-print { display: none !important; }
        }
      ` }} />

      <div className="no-print btn-print-wrap">
        <button id="btn-print-declaracao" className="btn-print">Imprimir Declaração</button>
      </div>

      <div className="doc">
        <div className="header">
          <img src="/logo.png" alt="MAGNA LOG" className="logo" />
          <div className="company">
            <div className="company-name">MAGNA LOG TRANSPORTES LTDA</div>
            <div className="doc-title">DECLARAÇÃO DE RECEBIMENTO</div>
          </div>
        </div>

        <p className="intro">
          Declaramos ter conferido e recebido a(s) mercadoria(s) especificada(s) na(s) seguinte(s) nota(s) fiscal(is),
          relacionados abaixo salvo em que se houver qualquer irregularidade quanto ao recebimento será relacionado
          no campo de observação desta.
        </p>

        <div className="field"><b>Transportadora:</b> {transportadora}</div>
        <div className="field"><b>Motorista:</b> {motoristaNome}</div>
        <div className="field"><b>CPF:</b> {formatCPF(motoristaCpf)}</div>
        <div className="field"><b>Placa:</b> {placa}</div>
        <br />
        <div className="field"><b>CONFERENTE:</b> {conferente}</div>
        <br />
        <div className="field"><b>FORNECEDOR:</b> {fornecedor}</div>

        <div className="divisor" />

        {avaria.observacoes && (
          <div className="field" style={{ marginBottom: 10 }}>
            <b>OBS:</b> {avaria.observacoes}
          </div>
        )}

        <div className="divergencia">
          <b>Divergência:</b>
          <span style={{ marginRight: 12 }}>{checkbox(has("FALTA"))} Falta</span>
          <span style={{ marginRight: 12 }}>{checkbox(has("AVARIA"))} Avaria</span>
          <span style={{ marginRight: 12 }}>{checkbox(has("INVERSAO"))} Inversão</span>
          <span style={{ marginRight: 12 }}>{checkbox(has("SOBRA") || has("DEVOLUCAO") || has("SEM_PEDIDO"))} Outro</span>
        </div>

        {avaria.produtos.length === 0 ? (
          <div style={{ fontStyle: "italic", color: "#666" }}>Nenhum produto informado.</div>
        ) : (
          avaria.produtos.map((p, i) => {
            const tipo = p.tipoDivergencia || avaria.tipo;
            const nfNum = p.notaFiscal?.numero || avaria.notaFiscal?.numero || "";
            const qtd = p.quantidadeAvaria % 1 === 0 ? String(p.quantidadeAvaria) : p.quantidadeAvaria.toFixed(2);
            return (
              <div key={i} className="produto-block">
                <div className="produto-line">
                  PRODUTO: {p.descricao} ({TIPO_LABEL[tipo] || tipo}) – {qtd} {p.unidade || "FARDOS"}
                </div>
                <div className="produto-sub">
                  NF: {nfNum} &nbsp;&nbsp; COD: {p.codigoProduto}
                </div>
              </div>
            );
          })
        )}

        <div className="footer-data">{dataStr}</div>

        <div className="assinaturas">
          <div className="ass-col">
            <div className="ass-line">Assinatura Motorista</div>
          </div>
          <div className="ass-col">
            <div className="ass-line">Assinatura Conferente</div>
          </div>
        </div>

        <div className="emitido">Emitido por: {conferente}</div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        const btn = document.getElementById("btn-print-declaracao");
        if (btn) btn.onclick = function() { window.print(); };
      ` }} />
    </>
  );
}
