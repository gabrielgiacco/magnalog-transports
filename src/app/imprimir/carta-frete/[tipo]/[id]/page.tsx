import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
const formatCNPJ = (cnpj: string) => {
  if (!cnpj) return "";
  const s = cnpj.replace(/\D/g, "");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return cnpj;
};

export default async function CartaFretePage({
  params,
  searchParams,
}: {
  params: { tipo: string; id: string };
  searchParams?: { motorista?: string };
}) {
  const { tipo, id } = params;
  const isCompl = searchParams?.motorista === "complementar";
  let data: any = null;

  if (tipo === "entrega") {
    data = await prisma.entrega.findUnique({
      where: { id },
      include: {
        motorista: true,
        veiculo: true,
        motoristaCompl: true,
        veiculoCompl: true,
        notas: true,
      },
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
  const destinoOrigem = "APARECIDA DE GOIANIA - GO";
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

  const m = isCompl ? data.motoristaCompl || {} : data.motorista || {};
  const v = isCompl ? data.veiculoCompl || {} : data.veiculo || {};

  const freteCombinado = isCompl ? data.valorMotoristaCompl || 0 : data.valorMotorista || 0;
  const adiantamento = isCompl ? data.adiantamentoMotoristaCompl || 0 : data.adiantamentoMotorista || 0;
  const pedagios = isCompl ? data.valorSaidaCompl || 0 : data.valorSaida || 0;
  const descontos = isCompl ? data.descontosMotoristaCompl || 0 : data.descontosMotorista || 0;
  const saldo = isCompl ? data.saldoMotoristaCompl || 0 : data.saldoMotorista || 0;

  const numeroDoc = `${data.codigo || data.id.slice(-6).toUpperCase()}${isCompl ? " (COMPL)" : ""}`;
  const dataEmissao = new Date().toLocaleDateString("pt-BR");

  const Via = ({ label }: { label: string }) => (
    <div className="border-[1.5px] border-black">
      {/* Row 1: Header */}
      <div className="flex border-b-[1.5px] border-black">
        <div className="w-[15%] border-r border-black flex items-center justify-center p-1">
          <img src="/logo.png" alt="Magna Log" className="max-w-full h-auto" style={{ maxHeight: "36px" }} />
        </div>
        <div className="w-[50%] p-0.5 border-r border-black leading-[1.15]">
          <div className="flex"><div className="font-bold w-[68px]">EMITENTE:</div><div>MAGNA LOG TRANSPORTES LTDA</div></div>
          <div className="flex"><div className="font-bold w-[68px]">ENDEREÇO:</div><div>AV. Euripedes Menezes Qd 08 Lt 02 Lot. Parque</div></div>
          <div className="flex"><div className="w-[68px]"></div><div>APARECIDA DE GOIANIA - GO - 74993-540</div></div>
          <div className="flex justify-between pr-2">
            <div><span className="font-bold">CNPJ:</span> 40784237000125</div>
            <div><span className="font-bold">IE:</span> 10.825.333-3</div>
          </div>
        </div>
        <div className="w-[35%] flex flex-col">
          <div className="font-bold text-base leading-tight px-1 py-0.5 border-b border-black">N° {numeroDoc}</div>
          <div className="font-bold px-1 py-0.5 border-b border-black text-[10px]">{label}</div>
          <div className="flex px-1 py-0.5">
            <div className="w-1/2"><span className="font-bold">DATA EMISSÃO:</span></div>
            <div className="w-1/2 text-center">{dataEmissao}</div>
          </div>
        </div>
      </div>

      {/* Row 2: Contact + NF */}
      <div className="flex border-b-[1.5px] border-black">
        <div className="w-[65%] flex justify-between px-1 py-0.5 border-r border-black bg-gray-100">
          <div><span className="font-bold">SITE/E-MAIL:</span> magnalog.com.br contato@magnalog.com.br</div>
          <div><span className="font-bold">FONE:</span> 62 9 9140.6563</div>
        </div>
        <div className="w-[35%] px-1 py-0.5 flex">
          <div className="w-1/2 font-bold">NF/DACTE N°:</div>
          <div className="w-1/2 font-bold">SÉRIE:</div>
        </div>
      </div>

      {/* Row 3: Remetente + Recibo */}
      <div className="flex border-b-[1.5px] border-black">
        <div className="w-[65%] border-r border-black flex flex-col justify-between px-1 py-0.5 leading-[1.15]">
          <div className="flex"><div className="font-bold w-[76px]">REMETENTE:</div><div>MAGNA LOG TRANSPORTES LTDA</div></div>
          <div className="flex"><div className="font-bold w-[76px]">ENDEREÇO:</div><div>AV DAS LARANJEIRAS</div></div>
          <div className="flex justify-between">
            <div className="flex w-1/2"><div className="font-bold w-[76px]">MUNICÍPIO:</div><div>APARECIDA DE GOIANIA</div></div>
            <div className="w-1/4"><span className="font-bold">UF:</span> GO</div>
          </div>
          <div className="flex justify-between">
            <div className="w-1/2"><span className="font-bold">CNPJ:</span> 40784237000125</div>
            <div className="w-1/2"><span className="font-bold">INSCR EST:</span> 108253333</div>
          </div>
        </div>
        <div className="w-[35%] flex flex-col">
          <div className="px-1 py-0.5 border-b border-black flex">
            <span className="font-bold w-24">Unidade Embarque:</span> MGL
          </div>
          <div className="font-bold text-center border-b border-black bg-gray-200 text-[9px] py-0.5">
            RECIBO DE ADIANTAMENTO {isCompl ? "COMPL" : ""}
          </div>
          <div className="px-1 py-0.5 text-[8.5px] leading-tight">
            Declaro que recebi da empresa emitente deste documento o valor de <strong>{formatCurrency(adiantamento)}</strong>
          </div>
        </div>
      </div>

      {/* Row 4: Destinatário + Assinatura */}
      <div className="flex border-b-[1.5px] border-black">
        <div className="w-[65%] border-r border-black flex flex-col justify-between px-1 py-0.5 leading-[1.15]">
          <div className="flex"><div className="font-bold w-[76px]">DESTINATÁRIO:</div><div className="truncate">{destinatarioRazao}</div></div>
          <div className="flex"><div className="font-bold w-[76px]">ENDEREÇO:</div><div className="truncate">{destinatarioEnd}</div></div>
          <div className="flex justify-between">
            <div className="flex w-1/2"><div className="font-bold w-[76px]">MUNICÍPIO:</div><div>{destinatarioMun}</div></div>
            <div className="w-1/4"><span className="font-bold">UF:</span> {destinatarioUf}</div>
          </div>
          <div className="flex justify-between">
            <div className="w-1/2"><span className="font-bold">CNPJ:</span> {formatCNPJ(destinatarioCnpj)}</div>
            <div className="w-1/2"><span className="font-bold">INSCR EST:</span> </div>
          </div>
        </div>
        <div className="w-[35%] flex flex-col justify-end px-2 py-1">
          <div className="border-t border-black text-center mt-6 pt-0.5 font-bold text-[9px]">ASSINATURA DO MOTORISTA</div>
        </div>
      </div>

      {/* Coleta / Entrega */}
      <div className="flex border-b-[1.5px] border-black px-1 py-0.5">
        <div className="w-1/2 flex"><div className="font-bold w-[76px]">COLETA:</div><div>{destinoOrigem}</div></div>
        <div className="w-1/2 flex"><div className="font-bold w-[76px]">ENTREGA:</div><div className="truncate">{destinoDestino}</div></div>
      </div>

      {/* Mercadoria */}
      <div className="border-b-[1.5px] border-black">
        <div className="text-center font-bold border-b border-black bg-gray-200 text-[9px] py-0.5">MERCADORIA TRANSPORTADA</div>
        <div className="flex text-center font-bold border-b border-black text-[9px]">
          <div className="w-[20%] border-r border-black py-0.5">NATUREZA DA CARGA</div>
          <div className="w-[35%] border-r border-black py-0.5">NOTA FISCAL</div>
          <div className="w-[15%] border-r border-black py-0.5">VALOR MERCADORIA</div>
          <div className="w-[15%] border-r border-black py-0.5">QUANT. M3/KG/TON</div>
          <div className="w-[15%] py-0.5">ESPÉCIE</div>
        </div>
        <div className="flex text-center text-[9px]">
          <div className="w-[20%] border-r border-black flex items-center justify-center px-0.5 py-0.5">DIVERSOS</div>
          <div className="w-[35%] border-r border-black flex items-center justify-center px-1 py-0.5 break-words">{notasStr}</div>
          <div className="w-[15%] border-r border-black flex items-center justify-center">{formatCurrency(sumValores)}</div>
          <div className="w-[15%] border-r border-black flex items-center justify-center">{sumPesos.toLocaleString("pt-BR")} KG</div>
          <div className="w-[15%] flex items-center justify-center">VOLUMES</div>
        </div>
      </div>

      {/* Dados Motorista/Veículo — header */}
      <div className="flex border-b border-black text-center font-bold bg-gray-200 text-[9px]">
        <div className="w-[45%] border-r border-black py-0.5">DADOS DO MOTORISTA</div>
        <div className="w-[55%] py-0.5">DADOS DO VEÍCULO</div>
      </div>

      {/* Dados Motorista/Veículo — body */}
      <div className="flex border-b-[1.5px] border-black">
        <div className="w-[45%] border-r border-black px-1 py-0.5 leading-[1.15]">
          <div className="flex"><div className="font-bold w-[72px]">MOTORISTA:</div><div className="truncate">{m.nome?.toUpperCase() || ""}</div></div>
          <div className="flex"><div className="font-bold w-[72px]">CPF:</div><div>{m.cpf || ""}</div></div>
          <div className="flex"><div className="font-bold w-[72px]">RG:</div><div></div></div>
          <div className="flex"><div className="font-bold w-[72px]">CIDADE:</div><div></div></div>
          <div className="flex"><div className="font-bold w-[72px]">CNH:</div><div className="w-1/2">{m.cnh || ""}</div><div className="font-bold w-10">VCTO:</div></div>
          <div className="flex"><div className="font-bold w-[72px]">FONE:</div><div>{m.telefone || ""}</div></div>
        </div>
        <div className="w-[55%] px-1 py-0.5 leading-[1.15]">
          <div className="flex"><div className="font-bold w-[92px]">PROPRIETÁRIO:</div><div className="truncate">MAGNA LOG TRANSPORTES LTDA</div></div>
          <div className="flex"><div className="font-bold w-[92px]">ENDEREÇO:</div><div className="truncate">AV. Euripedes Menezes Qd 08 Lt 02</div></div>
          <div className="flex justify-between">
            <div className="flex"><div className="font-bold w-[92px]">FONE:</div><div>62 9 9140.6563</div></div>
            <div className="flex gap-1"><span className="font-bold">CIDADE:</span><span>APARECIDA</span><span className="font-bold">UF:</span><span>GO</span></div>
          </div>
          <div className="flex justify-between">
            <div className="flex"><div className="font-bold w-[92px]">CNPJ/CPF:</div><div>40784237000125</div></div>
            <div className="flex gap-1"><span className="font-bold">INSCR EST:</span><span>10.825.333-3</span></div>
          </div>
          <div className="flex justify-between">
            <div className="flex"><div className="font-bold w-[92px]">PLACA 1:</div><div>{v.placa?.toUpperCase() || ""}</div></div>
            <div className="flex gap-1"><span className="font-bold">PLACA 2:</span><span className="w-14"></span><span className="font-bold">PLACA 3:</span></div>
          </div>
        </div>
      </div>

      {/* Observações */}
      <div className="border-b-[1.5px] border-black px-1 py-0.5 text-justify text-[8.5px] leading-[1.2]">
        <span className="font-bold">OBSERVAÇÕES: </span>
        Motorista responsável pela guarda, integridade e correta entrega da carga fracionada desde o recebimento até a comprovação de entrega, nos termos do Código Civil (Art. 730-756) e Lei 11.442/2007.
        {data.observacoes && (
          <span className="block mt-0.5 uppercase">
            <strong>NOTA/EXTRA:</strong> {data.observacoes}
          </span>
        )}
      </div>

      {/* Composição + Assinaturas */}
      <div className="flex">
        <div className="w-[45%] flex flex-col border-r-[1.5px] border-black">
          <div className="text-center font-bold border-b border-black bg-gray-200 text-[9px] py-0.5">
            COMPOSIÇÃO FRETE MOTORISTA {isCompl ? "COMPL" : ""}
          </div>
          <div className="flex text-center font-bold border-b border-black text-[9px]">
            <div className="w-[40%] border-r border-black py-0.5">FRETE COMBINADO R$</div>
            <div className="w-[30%] border-r border-black py-0.5">PESO CHEGADA</div>
            <div className="w-[30%] py-0.5">TOLERÂNCIA %</div>
          </div>
          <div className="flex text-center border-b border-black text-[9px]">
            <div className="w-[40%] border-r border-black py-0.5">{formatCurrency(freteCombinado)}</div>
            <div className="w-[30%] border-r border-black py-0.5">0,00</div>
            <div className="w-[30%] py-0.5">0,00</div>
          </div>
          <div className="px-1 pr-3 py-0.5 flex flex-col leading-[1.15]">
            <div className="flex justify-between font-bold"><span>FRETE BRUTO</span><span>{formatCurrency(freteCombinado)}</span></div>
            <div className="flex justify-between"><span>(-) SEGURO</span><span>R$ 0,00</span></div>
            <div className="flex justify-between"><span>(-) ADIANTAMENTO</span><span>{formatCurrency(adiantamento)}</span></div>
            <div className="flex justify-between"><span>(-) FALTA MERCADORIA</span><span>{formatCurrency(descontos)}</span></div>
            <div className="flex justify-between"><span>(-) IRRF</span><span>R$ 0,00</span></div>
            <div className="flex justify-between"><span>(-) INSS</span><span>R$ 0,00</span></div>
            <div className="flex justify-between"><span>(-) SEST/SENAT</span><span>R$ 0,00</span></div>
            <div className="flex justify-between"><span>(+) ESTADIAS</span><span>R$ 0,00</span></div>
            <div className="flex justify-between"><span>(+) PEDÁGIOS</span><span>{formatCurrency(pedagios)}</span></div>
            <div className="flex justify-between font-bold border-t border-black mt-0.5 pt-0.5">
              <span>SALDO A RECEBER</span><span>{formatCurrency(saldo)}</span>
            </div>
          </div>
        </div>

        <div className="w-[55%] flex flex-col justify-between">
          <div className="flex flex-col items-center justify-center pt-3 pb-1">
            <div className="w-[80%] border-b border-black"></div>
            <div className="text-[8.5px] mt-0.5">NOME DO FUNCIONÁRIO</div>
            <div className="w-[80%] border-b border-black mt-4"></div>
            <div className="text-[8.5px] mt-0.5">ASSINATURA</div>
          </div>
          <div className="border-t-[1.5px] border-black text-center py-1 flex flex-col items-center justify-center leading-[1.15]">
            <div className="font-bold text-sm tracking-widest">ATENÇÃO!</div>
            <div className="text-[8.5px]">NO PAGAMENTO DE ADIANTAMENTO VERIFICAR</div>
            <div className="text-[8.5px]">NOTA FISCAL, DACTE, PLACA E DADOS DO MOTORISTA</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4 landscape; margin: 5mm; }
        @media print {
          body { padding: 0 !important; margin: 0 !important; }
          html, body { width: 100%; height: 100%; }
          .no-print { display: none !important; }
          .print-page { width: 100% !important; max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .via-wrapper { break-inside: avoid; }
          .cut-column {
            border-left: 1px dashed #666 !important;
          }
        }
        .cut-column {
          border-left: 1px dashed #666;
          position: relative;
        }
        .cut-column::before {
          content: "✂";
          position: absolute;
          left: -6px;
          top: 50%;
          transform: translateY(-50%);
          background: white;
          font-size: 10px;
          color: #666;
          padding: 2px 0;
        }
      ` }} />

      <div className="bg-white text-black w-full p-2 print:p-0" style={{ fontFamily: "Arial, sans-serif" }}>
        <div className="print-page max-w-[1400px] mx-auto text-[9px] font-sans relative">
          <div className="absolute -top-10 right-0 no-print">
            <button
              id="btn-print-carta-frete"
              className="bg-blue-600 text-white px-4 py-2 rounded font-bold shadow hover:bg-blue-700"
            >
              Imprimir Carta Frete (2 vias)
            </button>
          </div>

          <div className="flex gap-2 print:gap-0">
            <div className="w-1/2 via-wrapper pr-1">
              <Via label="1ª VIA - MOTORISTA" />
            </div>
            <div className="w-1/2 via-wrapper pl-1 cut-column">
              <Via label="2ª VIA - EMPRESA" />
            </div>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              const btn = document.getElementById("btn-print-carta-frete");
              if (btn) { btn.onclick = function() { window.print(); } }
            `,
          }}
        />
      </div>
    </>
  );
}
