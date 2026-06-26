import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { XMLParser } from "fast-xml-parser";
import { logFromRequest } from "@/lib/audit";

function parseNFProducts(xmlContent: string | null) {
  if (!xmlContent) return { produtos: [], infAdicionais: "", infFisco: "", emitente: null };
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: false,
      numberParseOptions: { hex: false, leadingZeros: false, skipLike: /.*/ },
    });
    const parsed = parser.parse(xmlContent);
    const nfe = parsed?.nfeProc?.NFe || parsed?.NFe;
    const infNFe = nfe?.infNFe;
    if (!infNFe) return { produtos: [], infAdicionais: "", infFisco: "", emitente: null };

    // Products
    const detArray = Array.isArray(infNFe.det) ? infNFe.det : infNFe.det ? [infNFe.det] : [];
    const produtos = detArray.map((d: any) => {
      const p = d.prod || {};
      return {
        codigo: String(p.cProd || ""),
        descricao: String(p.xProd || ""),
        ncm: String(p.NCM || ""),
        cfop: String(p.CFOP || ""),
        unidade: String(p.uCom || ""),
        quantidade: parseFloat(String(p.qCom || "0")) || 0,
        valorUnitario: parseFloat(String(p.vUnCom || "0")) || 0,
        valorTotal: parseFloat(String(p.vProd || "0")) || 0,
        ean: String(p.cEAN || ""),
      };
    });

    // Additional info
    const infAdic = infNFe.infAdic || {};
    const infAdicionais = String(infAdic.infCpl || "");
    const infFisco = String(infAdic.infAdFisco || "");

    // Emitter full data
    const emit = infNFe.emit || {};
    const enderEmit = emit.enderEmit || {};
    const emitente = {
      cnpj: String(emit.CNPJ || emit.CPF || ""),
      razaoSocial: String(emit.xNome || ""),
      fantasia: String(emit.xFant || ""),
      ie: String(emit.IE || ""),
      cidade: String(enderEmit.xMun || ""),
      uf: String(enderEmit.UF || ""),
      endereco: `${enderEmit.xLgr || ""} ${enderEmit.nro || ""}`.trim(),
      bairro: String(enderEmit.xBairro || ""),
      cep: String(enderEmit.CEP || ""),
      telefone: String(enderEmit.fone || ""),
    };

    return { produtos, infAdicionais, infFisco, emitente };
  } catch {
    return { produtos: [], infAdicionais: "", infFisco: "", emitente: null };
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const entrega = await prisma.entrega.findUnique({
    where: { id: params.id },
    include: {
      motorista: true,
      veiculo: true,
      motoristaCompl: true,
      veiculoCompl: true,
      rota: true,
      notas: { orderBy: { createdAt: "asc" } },
      ocorrencias: { orderBy: { createdAt: "desc" } },
      cliente: true,
      qualidade: { select: { id: true } }
    },
  });

  if (!entrega) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  // Fetch palletizing rules for this client & the emitters of the NFs
  const emitentesCnpjs = Array.from(new Set(entrega.notas.map((n: any) => n.emitenteCnpj).filter(Boolean))) as string[];
  const cleanClienteCnpj = String(entrega.cnpj).replace(/\D/g, "");
  const cleanEmitentesCnpjs = emitentesCnpjs.map((c: string) => String(c).replace(/\D/g, ""));

  const normas = await prisma.normaPaletizacao.findMany({
    where: {
      clienteCnpj: cleanClienteCnpj,
      fornecedorCnpj: { in: cleanEmitentesCnpjs }
    }
  });

  const normasMap = new Map<string, any>();
  for (const n of normas) {
    normasMap.set(`${n.fornecedorCnpj}_${n.codigoProduto}`, n);
  }

  let totalPaletesEstimadosEntrega = 0;

  // Parse XML of each NF to include products, additional data and palletizing rules
  const notasComProdutos = entrega.notas.map((nf: any) => {
    const { produtos, infAdicionais, infFisco, emitente } = parseNFProducts(nf.xmlOriginal);
    const cleanFornecedorCnpj = String(nf.emitenteCnpj).replace(/\D/g, "");

    const produtosComNormas = produtos.map((p: any) => {
      const key = `${cleanFornecedorCnpj}_${p.codigo}`;
      const norma = normasMap.get(key);

      if (norma) {
        const paletesEstimados = p.quantidade / (norma.quantidadeCaixasPalete || 1);
        totalPaletesEstimadosEntrega += paletesEstimados;
        return {
          ...p,
          norma: {
            lastro: norma.lastro,
            altura: norma.altura,
            quantidadeCaixasPalete: norma.quantidadeCaixasPalete,
            embalagem: norma.embalagem,
          },
          paletesEstimados,
        };
      }
      return { ...p, norma: null, paletesEstimados: 0 };
    });

    const { xmlOriginal, ...nfSemXml } = nf;
    return { ...nfSemXml, produtos: produtosComNormas, infAdicionais, infFisco, emitente };
  });

  // Compute armazenagem automatically from TabelaArmazenagem per fornecedor/emitente das NFs
  let armazenagemCalc: any = null;
  if (entrega.quantidadePaletes > 0 && entrega.notas.length > 0) {
    const emitentesCnpjs = Array.from(new Set(entrega.notas.map((n: any) => n.emitenteCnpj).filter(Boolean))) as string[];
    if (emitentesCnpjs.length > 0) {
      const tabelas = await prisma.tabelaArmazenagem.findMany({
        where: { cnpjCliente: { in: emitentesCnpjs } },
      });
      if (tabelas.length > 0) {
        const MS_PER_DAY = 1000 * 60 * 60 * 24;
        const entrada = entrega.dataChegada || entrega.createdAt;
        const saida = entrega.dataEntrega || new Date();
        const dataEntrada = new Date(entrada); dataEntrada.setHours(0, 0, 0, 0);
        const dataSaida = new Date(saida); dataSaida.setHours(0, 0, 0, 0);
        const diasDecorridos = Math.max(0, Math.floor((dataSaida.getTime() - dataEntrada.getTime()) / MS_PER_DAY));

        const porFornecedor = tabelas.map((t: any) => {
          const diasCobraveis = Math.max(0, diasDecorridos - (t.diasFree || 0));
          const valorCalculado = diasCobraveis * (t.valorPaleteDia || 0) * (entrega.quantidadePaletes || 0);
          return {
            cnpjFornecedor: t.cnpjCliente,
            nomeFornecedor: t.nomeCliente,
            diasFree: t.diasFree,
            valorPaleteDia: t.valorPaleteDia,
            diasCobraveis,
            valorCalculado,
          };
        });

        armazenagemCalc = {
          diasDecorridos,
          emAberto: !entrega.dataEntrega,
          fornecedores: porFornecedor,
          valorTotal: porFornecedor.reduce((s: number, f: any) => s + f.valorCalculado, 0),
        };
      }
    }
  }

  return NextResponse.json({ ...entrega, notas: notasComProdutos, armazenagemCalc, totalPaletesEstimados: totalPaletesEstimadosEntrega });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const body = await req.json();

    // Recalcular saldo pendente automaticamente
    const valorFrete = body.valorFrete ?? undefined;
    const adiantamento = body.adiantamento ?? undefined;

    const data: any = { ...body };

    // Ao finalizar entrega, marcar canhoto como recebido, setar data de entrega e dar baixa nas ocorrências
    if (data.status === "FINALIZADO") {
      data.statusCanhoto = "RECEBIDO";
      if (!data.dataEntrega) data.dataEntrega = new Date();

      // Dar baixa automática em todas as ocorrências não resolvidas desta entrega
      await prisma.ocorrencia.updateMany({
        where: { entregaId: params.id, resolvida: false },
        data: {
          resolvida: true,
          resolucao: "Baixa automática — entrega finalizada",
        },
      });
    }
    if (data.status === "ENTREGUE" && !data.dataEntrega) {
      data.dataEntrega = new Date();
    }

    // Preservar dataChegada: se veio como vazio/null, remover do payload para não sobrescrever
    // A dataChegada só deve mudar quando o usuário explicitamente define uma data no formulário de edição
    const dataChegadaExplicit = data.dataChegada;
    if (!dataChegadaExplicit || dataChegadaExplicit === "") {
      delete data.dataChegada;
    }

    // Transformar strings vazias (UI blank fields) in nulos para o Prisma
    // Exceto dataChegada que já foi tratada acima
    Object.keys(data).forEach((key) => {
      if (key === "dataChegada") return; // já tratado
      if (data[key] === "") {
        data[key] = null;
      }
    });

    if (data.dataChegada) data.dataChegada = new Date(data.dataChegada);
    if (data.dataAgendada) data.dataAgendada = new Date(data.dataAgendada);
    if (data.dataEntrega) data.dataEntrega = new Date(data.dataEntrega);
    if (data.dataPagamento) data.dataPagamento = new Date(data.dataPagamento);
    if (data.dataAdiantamento) data.dataAdiantamento = new Date(data.dataAdiantamento);
    if (data.dataPagamentoSaldo) data.dataPagamentoSaldo = new Date(data.dataPagamentoSaldo);
    if (data.dataAdiantamentoCompl) data.dataAdiantamentoCompl = new Date(data.dataAdiantamentoCompl);
    if (data.dataPagamentoSaldoCompl) data.dataPagamentoSaldoCompl = new Date(data.dataPagamentoSaldoCompl);

    if (data.motoristaId) {
      // Apenas recalcula se não vier explícito na request
      if (valorFrete === undefined && body.valorMotorista === undefined) {
        const moto = await prisma.motorista.findUnique({ where: { id: data.motoristaId }, select: { tipo: true, valorDiaria: true } });
        if (moto) {
          if (moto.tipo === "FROTA") data.valorMotorista = 0;
          else if (moto.tipo === "DIARIA") {
            // Verificar se já existe outra rota ou entrega direta para este motorista na mesma data
            const entregaAtual = await prisma.entrega.findUnique({ where: { id: params.id }, select: { dataAgendada: true } });
            const entregaDate = data.dataAgendada || entregaAtual?.dataAgendada || new Date();
            const diaInicio = new Date(entregaDate); diaInicio.setHours(0,0,0,0);
            const diaFim = new Date(entregaDate); diaFim.setHours(23,59,59,999);
            const [rotasMesmoDia, entregasMesmoDia] = await Promise.all([
              prisma.rota.count({ where: { motoristaId: data.motoristaId, data: { gte: diaInicio, lte: diaFim }, status: { not: "CANCELADA" } } }),
              prisma.entrega.count({ where: { id: { not: params.id }, motoristaId: data.motoristaId, rotaId: null, dataAgendada: { gte: diaInicio, lte: diaFim }, status: { notIn: ["PROGRAMADO", "EM_SEPARACAO"] } } }),
            ]);
            data.valorMotorista = (rotasMesmoDia + entregasMesmoDia) === 0 ? (moto.valorDiaria || 0) : 0;
          }
        }
      }
    }

    // Calcular saldo automaticamente se frete ou adiantamento mudou
    if (valorFrete !== undefined || adiantamento !== undefined) {
      const current = await prisma.entrega.findUnique({ where: { id: params.id } });
      const frete = valorFrete ?? current?.valorFrete ?? 0;
      const adt = adiantamento ?? current?.adiantamento ?? 0;
      data.saldoPendente = frete - adt;
    }

    // Calcular saldo do motorista automaticamente se valores do motorista mudaram
    const valorMotorista = body.valorMotorista ?? undefined;
    const valorSaida = body.valorSaida ?? undefined;
    const valorDescarga = body.valorDescarga ?? undefined;
    const adiantamentoMotorista = body.adiantamentoMotorista ?? undefined;
    const descontosMotorista = body.descontosMotorista ?? undefined;

    if (
      valorMotorista !== undefined ||
      valorSaida !== undefined ||
      valorDescarga !== undefined ||
      adiantamentoMotorista !== undefined ||
      descontosMotorista !== undefined
    ) {
      const current = await prisma.entrega.findUnique({ where: { id: params.id } });
      const vMotorista = valorMotorista ?? current?.valorMotorista ?? 0;
      const vSaida = valorSaida ?? current?.valorSaida ?? 0;
      const vDescarga = valorDescarga ?? current?.valorDescarga ?? 0;
      const vAdiantamento = adiantamentoMotorista ?? current?.adiantamentoMotorista ?? 0;
      const vDescontos = descontosMotorista ?? current?.descontosMotorista ?? 0;
      data.saldoMotorista = vMotorista + vDescarga - vAdiantamento - vSaida - vDescontos;
    }

    // Calcular saldo do complementar
    const valorMotoristaCompl = body.valorMotoristaCompl ?? undefined;
    const valorSaidaCompl = body.valorSaidaCompl ?? undefined;
    const adiantamentoMotoristaCompl = body.adiantamentoMotoristaCompl ?? undefined;
    const descontosMotoristaCompl = body.descontosMotoristaCompl ?? undefined;

    if (
      valorMotoristaCompl !== undefined ||
      valorSaidaCompl !== undefined ||
      adiantamentoMotoristaCompl !== undefined ||
      descontosMotoristaCompl !== undefined
    ) {
      const current = await prisma.entrega.findUnique({ where: { id: params.id } });
      const vMotoristaCompl = valorMotoristaCompl ?? current?.valorMotoristaCompl ?? 0;
      const vSaidaCompl = valorSaidaCompl ?? current?.valorSaidaCompl ?? 0;
      const vAdiantamentoCompl = adiantamentoMotoristaCompl ?? current?.adiantamentoMotoristaCompl ?? 0;
      const vDescontosCompl = descontosMotoristaCompl ?? current?.descontosMotoristaCompl ?? 0;
      data.saldoMotoristaCompl = vMotoristaCompl - vAdiantamentoCompl - vSaidaCompl - vDescontosCompl;
    }

    // Calcular armazenagem automaticamente com base na tabela do cliente
    {
      const current = await prisma.entrega.findUnique({ where: { id: params.id } });
      if (current) {
        const chegada = data.dataChegada || current.dataChegada;
        const entregaDate = data.dataEntrega || current.dataEntrega;
        const paletes = data.quantidadePaletes ?? current.quantidadePaletes ?? 0;

        if (chegada && entregaDate && paletes > 0) {
          const dias = Math.max(0, Math.floor((new Date(entregaDate).getTime() - new Date(chegada).getTime()) / (1000 * 60 * 60 * 24)));
          data.diasArmazenagem = dias;

          // Buscar tabela de armazenagem do cliente
          const tabela = await prisma.tabelaArmazenagem.findUnique({ where: { cnpjCliente: current.cnpj } });
          if (tabela) {
            const diasCobrados = Math.max(0, dias - tabela.diasFree);
            data.valorArmazenagem = diasCobrados * paletes * tabela.valorPaleteDia;
          }
        } else if (chegada && entregaDate) {
          data.diasArmazenagem = Math.max(0, Math.floor((new Date(entregaDate).getTime() - new Date(chegada).getTime()) / (1000 * 60 * 60 * 24)));
        }
      }
    }

    // Remove relational fields that can't be set directly
    delete data.notas;
    delete data.motorista;
    delete data.veiculo;
    delete data.rota;
    delete data.cliente;
    delete data.ocorrencias;
    delete data._count;
    delete data.id;
    delete data.codigo;
    delete data.createdAt;

    const entrega = await prisma.entrega.update({
      where: { id: params.id },
      data,
      include: {
        motorista: true,
        veiculo: true,
        motoristaCompl: true,
        veiculoCompl: true,
        rota: true,
        notas: { orderBy: { createdAt: "asc" } },
        ocorrencias: { orderBy: { createdAt: "desc" } },
      },
    });

    // Parse XML of each NF to include products and additional data
    const notasComProdutos = entrega.notas.map((nf) => {
      const { produtos, infAdicionais, infFisco, emitente } = parseNFProducts(nf.xmlOriginal);
      const { xmlOriginal, ...nfSemXml } = nf;
      return { ...nfSemXml, produtos, infAdicionais, infFisco, emitente };
    });

    // Compute armazenagem automatically from TabelaArmazenagem per fornecedor/emitente das NFs
    let armazenagemCalc: any = null;
    if (entrega.quantidadePaletes > 0 && entrega.notas.length > 0) {
      const emitentesCnpjs = Array.from(new Set(entrega.notas.map((n: any) => n.emitenteCnpj).filter(Boolean))) as string[];
      if (emitentesCnpjs.length > 0) {
        const tabelas = await prisma.tabelaArmazenagem.findMany({
          where: { cnpjCliente: { in: emitentesCnpjs } },
        });
        if (tabelas.length > 0) {
          const MS_PER_DAY = 1000 * 60 * 60 * 24;
          const entrada = entrega.dataChegada || entrega.createdAt;
          const saida = entrega.dataEntrega || new Date();
          const dataEntrada = new Date(entrada); dataEntrada.setHours(0, 0, 0, 0);
          const dataSaida = new Date(saida); dataSaida.setHours(0, 0, 0, 0);
          const diasDecorridos = Math.max(0, Math.floor((dataSaida.getTime() - dataEntrada.getTime()) / MS_PER_DAY));

          const porFornecedor = tabelas.map((t: any) => {
            const diasCobraveis = Math.max(0, diasDecorridos - (t.diasFree || 0));
            const valorCalculado = diasCobraveis * (t.valorPaleteDia || 0) * (entrega.quantidadePaletes || 0);
            return {
              cnpjFornecedor: t.cnpjCliente,
              nomeFornecedor: t.nomeCliente,
              diasFree: t.diasFree,
              valorPaleteDia: t.valorPaleteDia,
              diasCobraveis,
              valorCalculado,
            };
          });

          armazenagemCalc = {
            diasDecorridos,
            emAberto: !entrega.dataEntrega,
            fornecedores: porFornecedor,
            valorTotal: porFornecedor.reduce((s: number, f: any) => s + f.valorCalculado, 0),
          };
        }
      }
    }

    // Auditoria
    const sessionUser = (session.user as any);
    await logFromRequest(req, "ENTREGA_EDITADA", {
      user: { id: sessionUser?.id, email: sessionUser?.email, name: sessionUser?.name, role: sessionUser?.role },
      recursoTipo: "entrega",
      recursoId: entrega.id,
      recursoDesc: `${entrega.codigo} · ${entrega.razaoSocial}`,
      detalhes: { camposAlterados: Object.keys(data) },
    });

    return NextResponse.json({ ...entrega, notas: notasComProdutos, armazenagemCalc });
  } catch (error: any) {
    console.error("Erro no PUT /api/entregas/[id]:", error);
    return NextResponse.json({ error: error.message || "Erro interno ao atualizar a entrega" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  if (body.action !== "separar" || !Array.isArray(body.notaIds) || body.notaIds.length === 0) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const entregaOrigem = await prisma.entrega.findUnique({
    where: { id: params.id },
    include: { notas: true },
  });
  if (!entregaOrigem) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  const notasParaSeparar = entregaOrigem.notas.filter((n) => body.notaIds.includes(n.id));
  if (notasParaSeparar.length === 0) return NextResponse.json({ error: "Nenhuma nota válida selecionada" }, { status: 400 });
  if (notasParaSeparar.length === entregaOrigem.notas.length) return NextResponse.json({ error: "Não é possível separar todas as notas. Mova pelo menos uma." }, { status: 400 });

  // Calcular totais da nova entrega
  const pesoTotal = notasParaSeparar.reduce((s, n) => s + n.pesoBruto, 0);
  const volumeTotal = notasParaSeparar.reduce((s, n) => s + n.volumes, 0);

  // Gerar código para nova entrega
  const count = await prisma.entrega.count();
  const codigo = notasParaSeparar.map((n) => n.numero).join(" / ");

  // Criar nova entrega com dados do mesmo destinatário (herdar dataChegada da original)
  const novaEntrega = await prisma.entrega.create({
    data: {
      codigo,
      cnpj: entregaOrigem.cnpj,
      razaoSocial: entregaOrigem.razaoSocial,
      cidade: entregaOrigem.cidade,
      uf: entregaOrigem.uf,
      endereco: entregaOrigem.endereco,
      bairro: entregaOrigem.bairro,
      cep: entregaOrigem.cep,
      pesoTotal,
      volumeTotal,
      status: entregaOrigem.status,
      dataChegada: entregaOrigem.dataChegada,
    },
  });

  // Mover notas para nova entrega
  await prisma.notaFiscal.updateMany({
    where: { id: { in: body.notaIds } },
    data: { entregaId: novaEntrega.id },
  });

  // Recalcular totais da entrega original
  const notasRestantes = entregaOrigem.notas.filter((n) => !body.notaIds.includes(n.id));
  const novoCodigo = notasRestantes.map((n) => n.numero).join(" / ");
  await prisma.entrega.update({
    where: { id: params.id },
    data: {
      codigo: novoCodigo || entregaOrigem.codigo,
      pesoTotal: notasRestantes.reduce((s, n) => s + n.pesoBruto, 0),
      volumeTotal: notasRestantes.reduce((s, n) => s + n.volumes, 0),
    },
  });

  const sessionUser = (session.user as any);
  await logFromRequest(req, "ENTREGA_CRIADA", {
    user: { id: sessionUser?.id, email: sessionUser?.email, name: sessionUser?.name, role: sessionUser?.role },
    recursoTipo: "entrega",
    recursoId: novaEntrega.id,
    recursoDesc: `${novaEntrega.codigo} · ${novaEntrega.razaoSocial}`,
    detalhes: { acao: "separar", origemEntregaId: params.id, notasSeparadas: notasParaSeparar.length },
  });

  return NextResponse.json({ novaEntregaId: novaEntrega.id, notasSeparadas: notasParaSeparar.length }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = (session.user as any);
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const entregaInfo = await prisma.entrega.findUnique({
    where: { id: params.id },
    select: { codigo: true, razaoSocial: true, _count: { select: { notas: true } } },
  });

  // Deletar registros relacionados antes de deletar a entrega
  await prisma.notaFiscal.deleteMany({ where: { entregaId: params.id } });

  await prisma.entrega.delete({ where: { id: params.id } });

  await logFromRequest(req, "ENTREGA_APAGADA", {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    recursoTipo: "entrega",
    recursoId: params.id,
    recursoDesc: entregaInfo ? `${entregaInfo.codigo} · ${entregaInfo.razaoSocial}` : params.id,
    detalhes: { notasApagadas: entregaInfo?._count.notas || 0 },
  });

  return NextResponse.json({ ok: true });
}
