/**
 * Seed de desenvolvimento.
 *
 * Popula um banco VAZIO E DESCARTAVEL com o minimo pra navegar o sistema:
 * um usuario ADMIN, motoristas, veiculos, embarcador, clientes e entregas
 * espalhadas na semana (com atrasos e ocorrencias, pra o dashboard e o kanban
 * terem o que mostrar).
 *
 * ATENCAO — este script APAGA as tabelas que ele mesmo popula antes de
 * recriar, pra poder rodar mais de uma vez. Por isso ele so aceita rodar
 * contra banco local: o `.env` deste projeto aponta para o banco de
 * PRODUCAO da Vercel, e sem a trava abaixo um `npx prisma db seed` distraido
 * limparia entregas reais.
 *
 * Uso:
 *   DATABASE_URL="postgresql://user@127.0.0.1:5432/tms_dev" npx prisma db seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_SENHA = "local123";

const HOSTS_LOCAIS = ["localhost", "127.0.0.1", "::1", "[::1]"];

/**
 * Recusa rodar fora de localhost. Falha fechado: URL ausente, ilegivel ou
 * apontando para qualquer host remoto aborta antes de tocar no banco.
 */
function exigirBancoLocal(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL nao definida. O seed precisa de um banco local explicito.");
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL ilegivel. Abortando por seguranca.");
  }

  // Hostname vazio = conexao por socket unix, que so existe na propria maquina.
  if (host !== "" && !HOSTS_LOCAIS.includes(host)) {
    throw new Error(
      `Este seed apaga dados e so roda contra banco local.\n` +
        `  Host encontrado na DATABASE_URL: "${host}"\n` +
        `  Hosts aceitos: ${HOSTS_LOCAIS.join(", ")} (ou socket unix)\n\n` +
        `Se voce queria mesmo popular este banco, aponte a DATABASE_URL para\n` +
        `uma copia local antes de rodar. O .env deste projeto aponta para\n` +
        `PRODUCAO — nao rode o seed com ele.`
    );
  }
}

const MOTORISTAS = [
  { nome: "Alison Prado", cpf: "11111111111", telefone: "(49) 99111-1111" },
  { nome: "Rafael Munhoz", cpf: "22222222222", telefone: "(47) 99222-2222" },
  { nome: "Jeferson Lima", cpf: "33333333333", telefone: "(41) 99333-3333" },
  { nome: "Diego Farias", cpf: "44444444444", telefone: "(44) 99444-4444" },
  { nome: "Sergio Bortolin", cpf: "55555555555", telefone: "(48) 99555-5555" },
];

const VEICULOS = [
  { placa: "ABC1D23", tipo: "TRUCK" as const, modelo: "VW Constellation", capacidadeKg: 14000 },
  { placa: "EFG4H56", tipo: "TOCO" as const, modelo: "MB Atego", capacidadeKg: 8000 },
  { placa: "IJK7L89", tipo: "CARRETA" as const, modelo: "Scania R450", capacidadeKg: 30000 },
  { placa: "MNO0P12", tipo: "VUC" as const, modelo: "Iveco Daily", capacidadeKg: 3500 },
];

// O embarcador e quem contrata o frete — derivado de NotaFiscal.emitenteCnpj.
// Nao confundir com o model Cliente, que e o destinatario da carga.
const EMBARCADORES = [
  { cnpj: "11222333000199", nome: "Industria Alimenticia Sul SA" },
  { cnpj: "44555666000177", nome: "Quimica Parana Ltda" },
];

// Destinatarios: razao social, cidade, uf.
const DESTINATARIOS: [string, string, string][] = [
  ["Alimentos Vale Verde", "Chapeco", "SC"],
  ["Metalurgica Kron", "Joinville", "SC"],
  ["Distribuidora Aurora", "Curitiba", "PR"],
  ["Supermercados Bom Preco", "Maringa", "PR"],
  ["Ceramica Portobelo", "Criciuma", "SC"],
  ["Textil Marisol", "Blumenau", "SC"],
  ["AgroSul Insumos", "Cascavel", "PR"],
  ["Farmacias Popular SC", "Florianopolis", "SC"],
];

const STATUS = [
  "PROGRAMADO", "EM_SEPARACAO", "CARREGADO", "EM_ROTA",
  "ENTREGUE", "FINALIZADO", "OCORRENCIA",
] as const;

const TOTAL_ENTREGAS = 34;

/** So as tabelas que este seed cria. Ordem respeita as FKs. */
async function limpar(): Promise<void> {
  await prisma.ocorrencia.deleteMany();
  await prisma.notaFiscal.deleteMany();
  await prisma.entrega.deleteMany();
  await prisma.veiculo.deleteMany();
  await prisma.motorista.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.tabelaTicket.deleteMany();
  await prisma.user.deleteMany();
}

async function main(): Promise<void> {
  exigirBancoLocal();
  await limpar();

  await prisma.user.create({
    data: {
      name: "Admin Local",
      email: ADMIN_EMAIL,
      password: await bcrypt.hash(ADMIN_SENHA, 12),
      role: "ADMIN",
      ativo: true,
      aprovado: true,
    },
  });

  const motoristas = [];
  for (const m of MOTORISTAS) {
    motoristas.push(
      await prisma.motorista.create({ data: { ...m, ativo: true, tipo: "TERCEIRO" } })
    );
  }

  const veiculos = [];
  for (let i = 0; i < VEICULOS.length; i++) {
    veiculos.push(
      await prisma.veiculo.create({
        data: { ...VEICULOS[i], ano: 2020 + i, ativo: true, motoristaId: motoristas[i].id },
      })
    );
  }

  for (const e of EMBARCADORES) {
    await prisma.tabelaTicket.create({
      data: { cnpjEmbarcador: e.cnpj, nomeEmbarcador: e.nome },
    });
  }

  const clientes = [];
  for (let i = 0; i < DESTINATARIOS.length; i++) {
    clientes.push(
      await prisma.cliente.create({
        data: {
          cnpj: `9988776600${String(i).padStart(4, "0")}`,
          razaoSocial: DESTINATARIOS[i][0],
        },
      })
    );
  }

  const hoje = new Date();
  hoje.setHours(9, 0, 0, 0);
  let numeroNf = 104840;

  for (let i = 0; i < TOTAL_ENTREGAS; i++) {
    const idx = i % DESTINATARIOS.length;
    const [razao, cidade, uf] = DESTINATARIOS[idx];
    const cliente = clientes[idx];
    const embarcador = EMBARCADORES[i % EMBARCADORES.length];
    const status = STATUS[i % STATUS.length];
    const finalizada = status === "ENTREGUE" || status === "FINALIZADO";

    // Espalha de 6 dias atras a 3 dias a frente: enche o grafico da semana e
    // produz atrasos de verdade (agendada no passado e nao entregue).
    const deslocamento = (i % 10) - 6;
    const agendada = new Date(hoje);
    agendada.setDate(agendada.getDate() + deslocamento);
    const criada = new Date(hoje);
    criada.setDate(criada.getDate() - Math.min(6, Math.abs(deslocamento)));

    const entrega = await prisma.entrega.create({
      data: {
        codigo: `E-${1000 + i}`,
        clienteId: cliente.id,
        cnpj: cliente.cnpj,
        razaoSocial: razao,
        cidade,
        uf,
        dataAgendada: agendada,
        dataEntrega: finalizada && deslocamento <= 0 ? hoje : null,
        // Uma a cada sete fica sem motorista, pra existir carga a distribuir.
        motoristaId: i % 7 === 0 ? null : motoristas[i % motoristas.length].id,
        veiculoId: i % 7 === 0 ? null : veiculos[i % veiculos.length].id,
        pesoTotal: 800 + i * 317,
        volumeTotal: 5 + i,
        status,
        valorFrete: 900 + i * 143,
        valorMotorista: 400 + i * 62,
        saldoMotorista: 200 + i * 31,
        createdAt: criada,
        updatedAt: criada,
      },
    });

    await prisma.notaFiscal.create({
      data: {
        chaveAcesso: "43" + String(i).padStart(42, "0"),
        numero: String(numeroNf++),
        serie: "1",
        emitenteCnpj: embarcador.cnpj,
        emitenteRazao: embarcador.nome,
        destinatarioCnpj: cliente.cnpj,
        destinatarioRazao: razao,
        pesoBruto: entrega.pesoTotal,
        valorNota: 12000 + i * 900,
        dataEmissao: criada,
        entregaId: entrega.id,
      },
    });

    if (status === "OCORRENCIA") {
      await prisma.ocorrencia.create({
        data: {
          entregaId: entrega.id,
          tipo: "AVARIA",
          descricao: "Volume avariado no descarregamento",
          resolvida: false,
        },
      });
    }
  }

  console.log(
    [
      "Seed concluido:",
      `  ${TOTAL_ENTREGAS} entregas (com notas, atrasos e ocorrencias)`,
      `  ${motoristas.length} motoristas, ${veiculos.length} veiculos`,
      `  ${clientes.length} clientes, ${EMBARCADORES.length} embarcadores`,
      "",
      `  Login: ${ADMIN_EMAIL} / ${ADMIN_SENHA}`,
    ].join("\n")
  );
}

main()
  .catch((erro) => {
    console.error("\nSeed abortado:\n" + (erro instanceof Error ? erro.message : erro) + "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
