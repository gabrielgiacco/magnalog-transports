import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

// Formatter helpers
const formatCurrency = (val: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
const formatCNPJ = (cnpj: string) => {
  if (!cnpj) return "";
  const s = cnpj.replace(/\D/g, "");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return cnpj;
};

export default async function CartaFretePage({ params }: { params: { tipo: string; id: string } }) {
  const { tipo, id } = params;
  let data: any = null;

  if (tipo === "entrega") {
    data = await prisma.entrega.findUnique({
      where: { id },
      include: { motorista: true, veiculo: true, notas: true },
    });
  } else if (tipo === "rota") {
    data = await prisma.rota.findUnique({
      where: { id },
      include: { motorista: true, veiculo: true, entregas: { include: { notas: true } } },
    });
  }

  if (!data) return notFound();

  const notas = tipo === "entrega" ? data.notas : data.entregas.flatMap((e: any) => e.notas);

  let destinatarioRazao = "";
  let destinatarioEnd = "";
  let destinatarioMun = "";
  let destinatarioUf = "";
  let destinatarioCnpj = "";
  let destinoOrigem = "APARECIDA DE GOIANIA - GO";
  let destinoDestino = "";

  if (tipo === "entrega") {
    destinatarioRazao = data.razaoSocial || "";
    destinatarioCnpj = data.cnpj || "";
    destinatarioEnd = `${data.endereco || ""} ${data.bairro ? " - " + data.bairro : ""}`.trim();
    destinatarioMun = data.cidade || "";
    destinatarioUf = data.uf || "";
    destinoDestino = `${data.cidade || ""} - ${data.uf || ""}`;
  } else {
    destinatarioRazao = "DIVERSOS / MÚLTIPLOS DESTINOS";
    const cities = Array.from(new Set(data.entregas.map((e: any) => `${e.cidade} - ${e.uf}`)));
    destinoDestino = cities.join(" / ");
  }

  const sumValores = notas.reduce((acc: number, n: any) => acc + (n.valorNota || 0), 0);
  const sumPesos = notas.reduce((acc: number, n: any) => acc + (n.pesoBruto || 0), 0);
  const notasStr = notas.map((n: any) => n.numero).join(", ");

  const m = data.motorista || {};
  const v = data.veiculo || {};

  const freteCombinado = data.valorMotorista || 0;
  const adiantamento = data.adiantamentoMotorista || 0;
  const pedagios = data.valorSaida || 0;
  const descontos = data.descontosMotorista || 0;
  const saldo = data.saldoMotorista || 0;

  return (
    <div className="bg-white min-h-screen text-black w-full p-4 print:p-0">
      <div className="max-w-[1000px] mx-auto bg-white print:max-w-none text-[11px] leading-tight font-sans relative" style={{ fontFamily: "Arial, sans-serif" }}>
        
        {/* Helper print button visible only on screen */}
        <div className="absolute -top-12 right-0 print:hidden">
          <button onClick="window.print()" className="bg-blue-600 text-white px-4 py-2 rounded font-bold shadow hover:bg-blue-700">Imprimir Carta Frete</button>
        </div>

        {/* Global border */}
        <div className="border-[2px] border-black">
          
          {/* Row 1: Header */}
          <div className="flex border-b-[2px] border-black">
            {/* Logo */}
            <div className="w-[15%] border-r border-black flex items-center justify-center p-2">
              <img src="/logo-magna-carta.png" alt="Magna Log" className="max-w-full h-auto" style={{ maxHeight: "60px" }} />
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
            <div className="w-[35%] flex flex-col">
              <div className="font-bold text-xl p-1 border-b border-black">N° {data.codigo || data.id.slice(-6).toUpperCase()}</div>
              <div className="font-bold p-1 border-b border-black">1. VIA - MOTORISTA</div>
              <div className="flex p-1">
                <div className="w-1/2"><span className="font-bold">DATA EMISSÃO:</span></div>
                <div className="w-1/2 text-center">{new Date().toLocaleDateString("pt-BR")}</div>
              </div>
            </div>
          </div>

          {/* Row 2: Contact Info & NF */}
          <div className="flex border-b-[2px] border-black">
            <div className="w-[65%] flex justify-between p-1 border-r border-black bg-gray-100">
              <div><span className="font-bold">SITE/E-MAIL:</span> magnalog.com.br cotato@magnalog.com.br</div>
              <div><span className="font-bold">FONE:</span> 62 9 9140.6563</div>
            </div>
            <div className="w-[35%] p-1 flex">
              <div className="w-1/2 font-bold">NF/DACTE N°:</div>
              <div className="w-1/2 font-bold">SÉRIE:</div>
            </div>
          </div>

          {/* Row 3: Remetente & Recibo Header */}
          <div className="flex border-b-[2px] border-black h-24">
            <div className="w-[65%] border-r border-black flex flex-col justify-between p-1">
              <div className="flex"><div className="font-bold w-24">REMETENTE:</div><div>MAGNA LOG TRANSPORTES LTDA</div></div>
              <div className="flex"><div className="font-bold w-24">ENDEREÇO:</div><div>AV DAS LARANJEIRAS</div></div>
              <div className="flex justify-between">
                <div className="flex w-1/2"><div className="font-bold w-24">MUNICÍPIO:</div><div>APARECIDA DE GOIANIA</div></div>
                <div className="w-1/4"><span className="font-bold">UF:</span> GO</div>
              </div>
              <div className="flex justify-between">
                <div className="w-1/2"><span className="font-bold">CNPJ:</span> 40784237000125</div>
                <div className="w-1/2"><span className="font-bold">INSCR EST:</span> 108253333</div>
              </div>
            </div>
            <div className="w-[35%] flex flex-col">
              <div className="p-1 border-b border-black flex">
                <span className="font-bold w-32">Unidade Embarque:</span> MGL
              </div>
              <div className="font-bold text-center border-b border-black bg-gray-200">RECIBO DE ADIANTAMENTO</div>
              <div className="p-2 text-[10px]">
                Declaro que recebi da empresa emitente deste documento o valor de <strong>{formatCurrency(adiantamento)}</strong>
              </div>
            </div>
          </div>

          {/* Row 4: Destinatário & Assinatura Motorista */}
          <div className="flex border-b-[2px] border-black h-24">
            <div className="w-[65%] border-r border-black flex flex-col justify-between p-1">
              <div className="flex"><div className="font-bold w-24">DESTINATÁRIO:</div><div>{destinatarioRazao}</div></div>
              <div className="flex"><div className="font-bold w-24">ENDEREÇO:</div><div>{destinatarioEnd}</div></div>
              <div className="flex justify-between">
                <div className="flex w-1/2"><div className="font-bold w-24">MUNICÍPIO:</div><div>{destinatarioMun}</div></div>
                <div className="w-1/4"><span className="font-bold">UF:</span> {destinatarioUf}</div>
              </div>
              <div className="flex justify-between">
                <div className="w-1/2"><span className="font-bold">CNPJ:</span> {formatCNPJ(destinatarioCnpj)}</div>
                <div className="w-1/2"><span className="font-bold">INSCR EST:</span> </div>
              </div>
            </div>
            <div className="w-[35%] flex flex-col justify-end p-2 pb-1">
              <div className="border-t border-black text-center mt-12 pt-1 font-bold text-[10px]">ASSINATURA DO MOTORISTA</div>
            </div>
          </div>

          {/* Row 5: Coleta / Entrega */}
          <div className="flex border-b-[2px] border-black p-1">
            <div className="w-1/2 flex"><div className="font-bold w-24">COLETA:</div><div>{destinoOrigem}</div></div>
            <div className="w-1/2 flex"><div className="font-bold w-24">ENTREGA:</div><div>{destinoDestino}</div></div>
          </div>

          {/* Mercadoria Transportada */}
          <div className="border-b-[2px] border-black">
            <div className="text-center font-bold border-b border-black bg-gray-200">MERCADORIA TRANSPORTADA</div>
            <div className="flex text-center font-bold border-b border-black text-[9px]">
              <div className="w-[15%] border-r border-black">DESTINO</div>
              <div className="w-[15%] border-r border-black">NATUREZA DA CARGA</div>
              <div className="w-[20%] border-r border-black">NOTA FISCAL</div>
              <div className="w-[15%] border-r border-black">VALOR MERCADORIA</div>
              <div className="w-[20%] border-r border-black">QUANT. M3 / KG / TON</div>
              <div className="w-[15%]">ESPÉCIE</div>
            </div>
            {notas.map((n: any, idx: number) => (
              <div key={n.id || idx} className="flex text-center min-h-[24px] border-b border-black last:border-b-0 text-[10px]">
                <div className="w-[15%] border-r border-black flex items-center justify-center truncate px-1">
                  {n.cidade ? `${n.cidade}/${n.uf}` : "DIVERSOS"}
                </div>
                <div className="w-[15%] border-r border-black flex items-center justify-center">DIVERSOS</div>
                <div className="w-[20%] border-r border-black flex items-center justify-center truncate px-1">{n.numero}</div>
                <div className="w-[15%] border-r border-black flex items-center justify-center">{formatCurrency(n.valorNota || 0)}</div>
                <div className="w-[20%] border-r border-black flex items-center justify-center">{(n.pesoBruto || 0).toLocaleString("pt-BR")} KG</div>
                <div className="w-[15%] flex items-center justify-center">{n.volumes || 0} VOL</div>
              </div>
            ))}
          </div>

          {/* Dados Motorista e Veículo Headers */}
          <div className="flex border-b border-black text-center font-bold bg-gray-200">
            <div className="w-[45%] border-r border-black">DADOS DO MOTORISTA</div>
            <div className="w-[55%]">DADOS DO VEÍCULO</div>
          </div>

          {/* Dados Motorista e Veículo Body */}
          <div className="flex border-b-[2px] border-black">
            {/* Motorista */}
            <div className="w-[45%] border-r border-black p-1 space-y-1">
              <div className="flex"><div className="font-bold w-20">MOTORISTA:</div><div>{m.nome?.toUpperCase() || ""}</div></div>
              <div className="flex"><div className="font-bold w-20">CPF:</div><div>{m.cpf || ""}</div></div>
              <div className="flex"><div className="font-bold w-20">RG:</div><div></div></div>
              <div className="flex"><div className="font-bold w-20">CIDADE:</div><div></div></div>
              <div className="flex"><div className="font-bold w-20">CNH:</div><div className="w-1/2">{m.cnh || ""}</div><div className="font-bold w-12">VCTO:</div></div>
              <div className="flex"><div className="font-bold w-20">FONE:</div><div>{m.telefone || ""}</div></div>
            </div>
            {/* Veiculo */}
            <div className="w-[55%] p-1 space-y-1">
              <div className="flex"><div className="font-bold w-28">PROPRIETÁRIO:</div><div>MAGNA LOG TRANSPORTES LTDA</div></div>
              <div className="flex"><div className="font-bold w-28">ENDEREÇO:</div><div>AV. Euripedes Menezes Qd 08 Lt 02 Lot. Parque Industrial Vice</div></div>
              <div className="flex justify-between">
                <div className="flex"><div className="font-bold w-28">FONE:</div><div>62 9 9140.6563</div></div>
                <div className="flex"><div className="font-bold mr-2">CIDADE:</div><div className="mr-4">APARECIDA DE GOIANIA</div><div className="font-bold mr-2">UF:</div><div>GO</div></div>
              </div>
              <div className="flex justify-between">
                <div className="flex"><div className="font-bold w-28">CNPJ/CPF:</div><div>40784237000125</div></div>
                <div className="flex"><div className="font-bold mr-2">INSCR EST/RG:</div><div>10.825.333-3</div></div>
              </div>
              <div className="flex justify-between">
                <div className="flex"><div className="font-bold w-28">PLACA 1:</div><div>{v.placa?.toUpperCase() || ""}</div></div>
                <div className="flex"><div className="font-bold mr-2">CIDADE:</div><div className="w-24"></div><div className="font-bold mr-2">UF:</div><div className="w-6"></div></div>
              </div>
              <div className="flex justify-between">
                <div className="flex"><div className="font-bold w-28">PLACA 2:</div><div></div></div>
                <div className="flex"><div className="font-bold mr-2">CIDADE:</div><div className="w-24"></div><div className="font-bold mr-2">UF:</div><div className="w-6"></div></div>
              </div>
              <div className="flex justify-between">
                <div className="flex"><div className="font-bold w-28">PLACA 3:</div><div></div></div>
                <div className="flex"><div className="font-bold mr-2">CIDADE:</div><div className="w-24"></div><div className="font-bold mr-2">UF:</div><div className="w-6"></div></div>
              </div>
            </div>
          </div>

          {/* Observações */}
          <div className="border-b-[2px] border-black p-1 text-justify">
            <span className="font-bold">OBSERVAÇÕES </span> NF: {notasStr}. Motorista responsável pela guarda, integridade e correta entrega da carga fracionada desde o recebimento até a comprovação de entrega, nos termos do Código Civil (Art. 730-756) e Lei 11.442/2007.
          </div>

          {/* Composição Financeira & Assinaturas */}
          <div className="flex">
            {/* Left Financial Box */}
            <div className="w-[45%] flex flex-col border-r-[2px] border-black">
              {/* Composição Header */}
              <div className="text-center font-bold border-b-[2px] border-black bg-gray-200">COMPOSIÇÃO FRETE MOTORISTA</div>
              {/* Combinado / Peso / Tolerancia */}
              <div className="flex text-center font-bold border-b-[2px] border-black">
                <div className="w-[40%] border-r border-black">FRETE COMBINADO R$</div>
                <div className="w-[30%] border-r border-black">PESO CHEGADA</div>
                <div className="w-[30%]">TOLERÂNCIA %</div>
              </div>
              <div className="flex text-center border-b border-black pb-1">
                <div className="w-[40%] border-r border-black">{formatCurrency(freteCombinado)}</div>
                <div className="w-[30%] border-r border-black">0,00</div>
                <div className="w-[30%]">0,00</div>
              </div>
              {/* Cálculos */}
              <div className="p-1 pr-6 flex flex-col gap-0.5">
                <div className="flex justify-between font-bold"><span>FRETE BRUTO (SUJEITO A</span><span>{formatCurrency(freteCombinado)}</span></div>
                <div className="flex justify-between"><span>(-) SEGURO</span><span>R$ 0,00</span></div>
                <div className="flex justify-between"><span>(-) ADIANTAMENTO</span><span>{formatCurrency(adiantamento)}</span></div>
                <div className="flex justify-between"><span>(-) FALTA DE MERCADORIA</span><span>{formatCurrency(descontos)}</span></div>
                <div className="flex justify-between"><span>(-) IMPOSTO RETIDO NA FONTE</span><span>R$ 0,00</span></div>
                <div className="flex justify-between"><span>(-) INSS</span><span>R$ 0,00</span></div>
                <div className="flex justify-between"><span>(-) SEST/SENAT</span><span>R$ 0,00</span></div>
                <div className="flex justify-between"><span>(+) ESTADIAS</span><span>R$ 0,00</span></div>
                <div className="flex justify-between"><span>(+) PEDÁGIOS</span><span>{formatCurrency(pedagios)}</span></div>
                <div className="flex justify-between font-bold mt-1"><span>SALDO A RECEBER</span><span>{formatCurrency(saldo)}</span></div>
              </div>
            </div>

            {/* Right Assinaturas Box */}
            <div className="w-[55%] flex flex-col justify-between">
              {/* Funcionário Assinatura */}
              <div className="flex flex-col items-center justify-center pt-8 pb-4">
                <div className="w-[80%] border-b border-black"></div>
                <div className="text-[10px] mt-1">NOME DO FUNCIONÁRIO</div>
                <div className="w-[80%] border-b border-black mt-8"></div>
                <div className="text-[10px] mt-1">ASSINATURA</div>
              </div>
              {/* Atenção */}
              <div className="border-t-[2px] border-black text-center py-2 flex flex-col items-center justify-center">
                <div className="font-bold text-lg tracking-widest">ATENÇÃO!</div>
                <div>NO PAGAMENTO DE ADIANTAMENTO VERIFICAR</div>
                <div>NOTA FISCAL, DACTE, PLACA E OS DADOS DO MOTORISTA</div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Script client side to auto trigger print and fix the button */}
      <script dangerouslySetInnerHTML={{ __html: `
        document.querySelectorAll('button[onClick="window.print()"]').forEach(b => {
          b.onclick = function() { window.print(); }
        });
      `}} />
    </div>
  );
}
