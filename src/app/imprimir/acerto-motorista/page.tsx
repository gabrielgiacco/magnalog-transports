import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

// Formatter helpers
const formatCurrency = (val: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
const formatWeight = (val: number) => {
  if (val >= 1000) return `${(val / 1000).toFixed(2).replace(".", ",")} t`;
  return `${val.toLocaleString("pt-BR")} kg`;
};
const formatDate = (date: any) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

export default async function AcertoMotoristaPage({ searchParams }: { searchParams: { motoristaId?: string; inicio?: string; fim?: string } }) {
  const { motoristaId, inicio, fim } = searchParams;

  if (!motoristaId || !inicio || !fim) {
    return notFound();
  }

  const motorista = await prisma.motorista.findUnique({
    where: { id: motoristaId },
  });

  if (!motorista) return notFound();

  // Range UTC-normalizado — cobre todo o dia independente de timezone salvo
  const parseDate = (s: string, isEnd = false) => {
    const ymd = s.length === 10 ? s : s.slice(0, 10);
    return new Date(ymd + (isEnd ? "T23:59:59.999Z" : "T00:00:00.000Z"));
  };
  const dateFilter = { gte: parseDate(inicio), lte: parseDate(fim, true) };

  // 1. Buscar entregas diretas (sem rota) como motorista principal
  const entregasDiretas = await prisma.entrega.findMany({
    where: {
      motoristaId,
      rotaId: null,
      dataAgendada: dateFilter,
    },
    include: {
      notas: true,
      veiculo: true,
    },
    orderBy: { dataAgendada: "asc" },
  });

  // 1b. Buscar entregas onde ele é motorista COMPLEMENTAR (frete adicional)
  const entregasComplementar = await prisma.entrega.findMany({
    where: {
      motoristaComplId: motoristaId,
      dataAgendada: dateFilter,
    },
    include: {
      notas: true,
      veiculoCompl: true,
    },
    orderBy: { dataAgendada: "asc" },
  });

  // 2. Buscar rotas
  const rotas = await prisma.rota.findMany({
    where: {
      motoristaId,
      data: dateFilter,
    },
    include: {
      veiculo: true,
      entregas: {
        include: { notas: true },
      },
    },
    orderBy: { data: "asc" },
  });

  // Consolidar viagens em uma lista única estruturada
  const viagens: any[] = [];
  let freteCombinadoTotal = 0;
  let adiantamentoTotal = 0;
  let pedagiosTotal = 0;
  let descontosTotal = 0;
  let saldoTotal = 0;
  let pesoTotalAcumulado = 0;
  let volumeTotalAcumulado = 0;

  // Processar entregas diretas
  for (const e of entregasDiretas) {
    const freteCombinado = e.valorMotorista || 0;
    const adiantamento = e.adiantamentoMotorista || 0;
    const pedagio = e.valorSaida || 0;
    const descontos = e.descontosMotorista || 0;
    const saldo = e.saldoMotorista || 0;
    const notasStr = e.notas.map((n: any) => n.numero).join(", ");
    const pesoNfs = e.notas.reduce((acc: number, n: any) => acc + (n.pesoBruto || 0), 0);
    const volumeNfs = e.notas.reduce((acc: number, n: any) => acc + (n.volumes || 0), 0);

    viagens.push({
      tipo: "DIRETA",
      codigo: e.codigo,
      notas: notasStr || "Sem NF",
      data: e.dataAgendada,
      destino: `${e.cidade} - ${e.uf || ""}`,
      placa: e.veiculo?.placa || "—",
      peso: pesoNfs || e.pesoTotal || 0,
      volumes: volumeNfs || e.volumeTotal || 0,
      freteCombinado,
      adiantamento,
      pedagio,
      descontos,
      saldo,
    });

    freteCombinadoTotal += freteCombinado;
    adiantamentoTotal += adiantamento;
    pedagiosTotal += pedagio;
    descontosTotal += descontos;
    saldoTotal += saldo;
    pesoTotalAcumulado += (pesoNfs || e.pesoTotal || 0);
    volumeTotalAcumulado += (volumeNfs || e.volumeTotal || 0);
  }

  // Processar entregas complementares (motorista atua como frete adicional)
  for (const e of entregasComplementar) {
    const freteCombinado = e.valorMotoristaCompl || 0;
    const adiantamento = e.adiantamentoMotoristaCompl || 0;
    const pedagio = e.valorSaidaCompl || 0;
    const descontos = e.descontosMotoristaCompl || 0;
    const saldo = e.saldoMotoristaCompl || 0;
    const notasStr = e.notas.map((n: any) => n.numero).join(", ");
    const pesoNfs = e.notas.reduce((acc: number, n: any) => acc + (n.pesoBruto || 0), 0);
    const volumeNfs = e.notas.reduce((acc: number, n: any) => acc + (n.volumes || 0), 0);

    viagens.push({
      tipo: "COMPLEMENTAR",
      codigo: e.codigo,
      notas: notasStr || "Sem NF",
      data: e.dataAgendada,
      destino: `${e.cidade} - ${e.uf || ""} (compl.)`,
      placa: e.veiculoCompl?.placa || "—",
      peso: pesoNfs || e.pesoTotal || 0,
      volumes: volumeNfs || e.volumeTotal || 0,
      freteCombinado,
      adiantamento,
      pedagio,
      descontos,
      saldo,
    });

    freteCombinadoTotal += freteCombinado;
    adiantamentoTotal += adiantamento;
    pedagiosTotal += pedagio;
    descontosTotal += descontos;
    saldoTotal += saldo;
    pesoTotalAcumulado += (pesoNfs || e.pesoTotal || 0);
    volumeTotalAcumulado += (volumeNfs || e.volumeTotal || 0);
  }

  // Processar rotas
  for (const r of rotas) {
    const freteCombinado = r.valorMotorista || 0;
    const adiantamento = r.adiantamentoMotorista || 0;
    const pedagio = r.valorSaida || 0;
    const descontos = r.descontosMotorista || 0;
    const saldo = r.saldoMotorista || 0;

    const allNfs = r.entregas.flatMap((e: any) => e.notas);
    const notasStr = allNfs.map((n: any) => n.numero).join(", ");
    const pesoNfs = allNfs.reduce((acc: number, n: any) => acc + (n.pesoBruto || 0), 0);
    const volumeNfs = allNfs.reduce((acc: number, n: any) => acc + (n.volumes || 0), 0);

    const destinos = Array.from(new Set(r.entregas.map((e: any) => `${e.cidade} - ${e.uf || ""}`)));

    viagens.push({
      tipo: "ROTA",
      codigo: r.codigo,
      notas: notasStr || "Sem NF",
      data: r.data,
      destino: destinos.join(" / "),
      placa: r.veiculo?.placa || "—",
      peso: pesoNfs || r.pesoTotal || 0,
      volumes: volumeNfs || r.volumeTotal || 0,
      freteCombinado,
      adiantamento,
      pedagio,
      descontos,
      saldo,
    });

    freteCombinadoTotal += freteCombinado;
    adiantamentoTotal += adiantamento;
    pedagiosTotal += pedagio;
    descontosTotal += descontos;
    saldoTotal += saldo;
    pesoTotalAcumulado += (pesoNfs || r.pesoTotal || 0);
    volumeTotalAcumulado += (volumeNfs || r.volumeTotal || 0);
  }

  const placaPrincipal = viagens.length > 0 ? viagens[viagens.length - 1].placa : "—";

  return (
    <div className="bg-white min-h-screen text-black w-full p-4 print:p-0">
      <div className="max-w-[1000px] mx-auto bg-white print:max-w-none text-[11px] leading-tight font-sans relative" style={{ fontFamily: "Arial, sans-serif" }}>
        
        {/* Helper print button visible only on screen */}
        <div className="absolute -top-12 right-0 print:hidden">
          <button id="btn-print-acerto" className="bg-orange-600 text-white px-4 py-2 rounded font-bold shadow hover:bg-orange-700">Imprimir Acerto</button>
        </div>

        {/* Global border */}
        <div className="border-[2px] border-black">
          
          {/* Row 1: Header */}
          <div className="flex border-b-[2px] border-black">
            {/* Logo */}
            <div className="w-[15%] border-r border-black flex items-center justify-center p-2">
              <img src="/logo.png" alt="Magna Log" className="max-w-full h-auto" style={{ maxHeight: "60px" }} />
            </div>
            {/* Emitente Info */}
            <div className="w-[50%] p-1 border-r border-black">
              <div className="flex"><div className="font-bold w-20">EMITENTE:</div><div>MAGNA LOG TRANSPORTES LTDA</div></div>
              <div className="flex"><div className="font-bold w-20">ENDEREÇO:</div><div>AV. Euripedes Menezes Qd 08 Lt 02 Lot. Parque</div></div>
              <div className="flex"><div className="w-20"></div><div>APARECIDA DE GOIANIA - GO - 74993-540</div></div>
              <div className="flex justify-between pr-4 mt-1">
                <div><span className="font-bold">CNPJ:</span> 40784237000125</div>
                <div><span className="font-bold">IE:</span> 10.825.333-3</div>
              </div>
            </div>
            {/* Document Info */}
            <div className="w-[35%] flex flex-col justify-between">
              <div className="font-bold text-base p-1 border-b border-black">RELATÓRIO DE ACERTO DE MOTORISTA</div>
              <div className="p-1 border-b border-black font-semibold">PERÍODO: {formatDate(inicio)} A {formatDate(fim)}</div>
              <div className="flex p-1">
                <div className="w-1/2"><span className="font-bold">DATA EMISSÃO:</span></div>
                <div className="w-1/2 text-center">{new Date().toLocaleDateString("pt-BR")}</div>
              </div>
            </div>
          </div>

          {/* Row 2: Contact Info & Placa */}
          <div className="flex border-b-[2px] border-black">
            <div className="w-[65%] flex justify-between p-1 border-r border-black bg-gray-100">
              <div><span className="font-bold">SITE/E-MAIL:</span> magnalog.com.br cotato@magnalog.com.br</div>
              <div><span className="font-bold">FONE:</span> 62 9 9140.6563</div>
            </div>
            <div className="w-[35%] p-1 flex">
              <div className="w-1/2 font-bold">VEÍCULO PRINCIPAL:</div>
              <div className="w-1/2 font-bold font-mono">{placaPrincipal.toUpperCase()}</div>
            </div>
          </div>

          {/* Row 3: Dados Motorista */}
          <div className="flex border-b-[2px] border-black text-center font-bold bg-gray-200">
            <div className="w-full">DADOS DO MOTORISTA</div>
          </div>
          <div className="flex border-b-[2px] border-black p-1">
            <div className="w-[45%] border-r border-black space-y-1 pr-2">
              <div className="flex"><div className="font-bold w-20">MOTORISTA:</div><div className="font-bold">{motorista.nome.toUpperCase()}</div></div>
              <div className="flex"><div className="font-bold w-20">CPF:</div><div>{motorista.cpf || "—"}</div></div>
            </div>
            <div className="w-[55%] space-y-1 pl-2">
              <div className="flex"><div className="font-bold w-20">CNH:</div><div>{motorista.cnh || "—"}</div><div className="font-bold ml-6 mr-2">CATEGORIA:</div><div>{motorista.categoriaCnh || "—"}</div></div>
              <div className="flex"><div className="font-bold w-20">TELEFONE:</div><div>{motorista.telefone || "—"}</div></div>
              <div className="flex"><div className="font-bold w-20">PIX:</div><div className="font-mono">{motorista.pix || "—"}</div></div>
            </div>
          </div>

          {/* Viagens Realizadas */}
          <div className="border-b-[2px] border-black">
            <div className="text-center font-bold border-b border-black bg-gray-200">DETALHE DE VIAGENS REALIZADAS NO PERÍODO</div>
            <div className="flex text-center font-bold border-b border-black text-[9px] bg-gray-50">
              <div className="w-[8%] border-r border-black py-1">DATA</div>
              <div className="w-[8%] border-r border-black py-1">TIPO</div>
              <div className="w-[10%] border-r border-black py-1">CÓDIGO</div>
              <div className="w-[20%] border-r border-black py-1">DESTINO</div>
              <div className="w-[12%] border-r border-black py-1">PESO/VOL.</div>
              <div className="w-[11%] border-r border-black py-1">FRT. COMBINADO</div>
              <div className="w-[11%] border-r border-black py-1">ADIANTAMENTO</div>
              <div className="w-[11%] border-r border-black py-1">SAÍDA/PEDÁGIO</div>
              <div className="w-[11%] py-1">SALDO LÍQUIDO</div>
            </div>

            {viagens.map((viagem, i) => (
              <div key={i} className="flex text-center text-[10px] min-h-[22px] border-b border-gray-300 items-center">
                <div className="w-[8%] border-r border-black py-0.5 font-mono">{formatDate(viagem.data)}</div>
                <div className="w-[8%] border-r border-black py-0.5 font-bold">{viagem.tipo}</div>
                <div className="w-[10%] border-r border-black py-0.5 font-mono font-bold text-blue-600">{viagem.codigo}</div>
                <div className="w-[20%] border-r border-black py-0.5 px-1 truncate text-left" title={viagem.destino}>{viagem.destino}</div>
                <div className="w-[12%] border-r border-black py-0.5 font-mono text-[9px]">{formatWeight(viagem.peso)} / {viagem.volumes} vol</div>
                <div className="w-[11%] border-r border-black py-0.5 font-mono text-right pr-1">{formatCurrency(viagem.freteCombinado)}</div>
                <div className="w-[11%] border-r border-black py-0.5 font-mono text-right pr-1 text-orange-600">{formatCurrency(viagem.adiantamento)}</div>
                <div className="w-[11%] border-r border-black py-0.5 font-mono text-right pr-1 text-blue-600">{formatCurrency(viagem.pedagio)}</div>
                <div className="w-[11%] font-mono text-right pr-1 font-bold text-green-700">{formatCurrency(viagem.saldo)}</div>
              </div>
            ))}

            {viagens.length === 0 && (
              <div className="text-center py-6 text-xs italic text-gray-500">Nenhuma viagem registrada no período.</div>
            )}

            {/* Totais da tabela */}
            <div className="flex text-center font-bold text-[10px] bg-gray-100 border-t border-black font-mono">
              <div className="w-[46%] border-r border-black py-1 text-left pl-2 uppercase">Totais do Período</div>
              <div className="w-[12%] border-r border-black py-1 text-center text-[9px]">{formatWeight(pesoTotalAcumulado)} / {volumeTotalAcumulado} v</div>
              <div className="w-[11%] border-r border-black py-1 text-right pr-1">{formatCurrency(freteCombinadoTotal)}</div>
              <div className="w-[11%] border-r border-black py-1 text-right pr-1 text-orange-600">{formatCurrency(adiantamentoTotal)}</div>
              <div className="w-[11%] border-r border-black py-1 text-right pr-1 text-blue-600">{formatCurrency(pedagiosTotal)}</div>
              <div className="w-[11%] py-1 text-right pr-1 text-green-700">{formatCurrency(saldoTotal)}</div>
            </div>
          </div>

          {/* Composição Financeira & Assinaturas */}
          <div className="flex">
            {/* Left Financial Box */}
            <div className="w-[45%] flex flex-col border-r-[2px] border-black">
              {/* Composição Header */}
              <div className="text-center font-bold border-b-[2px] border-black bg-gray-200">CONSOLIDAÇÃO FINANCEIRA</div>
              {/* Detalhe Cálculos */}
              <div className="p-2 pr-6 flex flex-col gap-1 text-[11px]">
                <div className="flex justify-between font-bold"><span>(+) FRETE BRUTO COMBINADO</span><span>{formatCurrency(freteCombinadoTotal)}</span></div>
                <div className="flex justify-between text-blue-600"><span>(+) VALES DE SAÍDA / PEDÁGIOS</span><span>{formatCurrency(pedagiosTotal)}</span></div>
                <div className="flex justify-between text-orange-600"><span>(-) ADIANTAMENTO TOTAL</span><span>{formatCurrency(adiantamentoTotal)}</span></div>
                <div className="flex justify-between text-red-600 font-semibold"><span>(-) DESCONTOS / AVARIAS</span><span>{formatCurrency(descontosTotal)}</span></div>
                <div className="border-t border-black my-1"></div>
                <div className="flex justify-between font-bold text-lg text-green-700 mt-1"><span>(=) SALDO LÍQUIDO A RECEBER</span><span>{formatCurrency(saldoTotal)}</span></div>
              </div>
            </div>

            {/* Right Assinaturas Box */}
            <div className="w-[55%] flex flex-col justify-between">
              <div className="p-2 text-[10px] text-justify leading-tight">
                <strong>RECIBO DE ADIANTAMENTO E QUITAÇÃO:</strong> Declaro que recebi da empresa emitente a importância líquida acima discriminada de <strong>{formatCurrency(saldoTotal)}</strong> referente ao acerto de fretes das viagens descritas neste relatório, dando plena, geral e rasa quitação de todos os valores.
              </div>
              {/* Assinaturas */}
              <div className="flex flex-col items-center justify-end pb-3 pt-6">
                <div className="flex w-full px-4 justify-between">
                  <div className="w-[45%] flex flex-col items-center">
                    <div className="w-full border-b border-black"></div>
                    <div className="text-[9px] mt-1 text-center font-bold">ASSINATURA DO MOTORISTA</div>
                    <div className="text-[8px] mt-0.5 text-gray-500 font-mono">CPF: {motorista.cpf || "—"}</div>
                  </div>
                  <div className="w-[45%] flex flex-col items-center">
                    <div className="w-full border-b border-black"></div>
                    <div className="text-[9px] mt-1 text-center font-bold">FINANCEIRO / EMITENTE</div>
                    <div className="text-[8px] mt-0.5 text-gray-500 font-mono">MAGNA LOG TRANSPORTES</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Script client side to auto trigger print and fix the button */}
      <script dangerouslySetInnerHTML={{ __html: `
        const btn = document.getElementById('btn-print-acerto');
        if (btn) btn.onclick = function() { window.print(); }
      `}} />
    </div>
  );
}
