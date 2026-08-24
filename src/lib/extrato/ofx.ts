// Parser de OFX (Open Financial Exchange), o formato que todo banco brasileiro
// exporta no extrato.
//
// OFX 1.x e SGML, nao XML: as tags nao fecham. Por isso o fast-xml-parser que
// ja existe no projeto nao serve aqui sem normalizar antes — e normalizar SGML
// para XML da mais trabalho que ler os campos direto.
// OFX 2.x ja e XML de verdade; o parser abaixo atende os dois porque le por
// regex de campo, sem depender do fechamento das tags.

export interface TransacaoOfx {
  /** FITID: identificador unico do banco. E o que evita duplicar na reimportacao. */
  idExterno: string;
  data: Date;
  /** Negativo = saida. */
  valor: number;
  descricao: string;
  /** CPF/CNPJ achado na descricao, quando houver. */
  documento: string | null;
}

export interface ExtratoOfx {
  /** ACCTID do cabecalho — usado para casar com a ContaBancaria cadastrada. */
  identificadorConta: string | null;
  banco: string | null;
  dataInicio: Date | null;
  dataFim: Date | null;
  transacoes: TransacaoOfx[];
}

/** Le o primeiro valor de uma tag, tolerando tag aberta (SGML) ou fechada (XML). */
function campo(bloco: string, tag: string): string | null {
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  if (!m) return null;
  const v = m[1].trim();
  return v === "" ? null : v;
}

/**
 * Datas OFX vem como YYYYMMDD, YYYYMMDDHHMMSS ou com fuso entre colchetes:
 * 20260812120000[-3:BRT]. Interpretamos como data local para nao deslocar o
 * dia — o que importa aqui e o dia do lancamento, nao o instante.
 */
function dataOfx(bruto: string | null): Date | null {
  if (!bruto) return null;
  const s = bruto.replace(/\[.*$/, "").trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, a, mes, d, h, min, seg] = m;
  const dt = new Date(
    Number(a), Number(mes) - 1, Number(d),
    Number(h || 12), Number(min || 0), Number(seg || 0)
  );
  return isNaN(dt.getTime()) ? null : dt;
}

function numero(bruto: string | null): number {
  if (!bruto) return 0;
  // Alguns bancos usam virgula decimal mesmo em OFX.
  const n = parseFloat(bruto.replace(/\s/g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
}

/**
 * Extrai CPF (11) ou CNPJ (14) da descricao.
 * Os extratos da Magna Log trazem coisas como
 * "Pagamento Pix 40784237000125 Magna" — o documento no meio do texto e um
 * dos sinais mais fortes para casar com motorista ou cliente.
 */
export function extrairDocumento(texto: string): string | null {
  const limpo = texto.replace(/[.\-/]/g, "");
  const m = limpo.match(/\b(\d{14}|\d{11})\b/);
  return m ? m[1] : null;
}

export function ehArquivoOfx(conteudo: string): boolean {
  return /<OFX>/i.test(conteudo) || /OFXHEADER/i.test(conteudo);
}

export function parseOfx(conteudo: string): ExtratoOfx {
  if (!ehArquivoOfx(conteudo)) {
    throw new Error("Arquivo não parece um OFX.");
  }

  const identificadorConta = campo(conteudo, "ACCTID");
  const banco = campo(conteudo, "BANKID") || campo(conteudo, "ORG");

  const transacoes: TransacaoOfx[] = [];
  // Cada movimento e um bloco STMTTRN. Capturamos ate o fechamento explicito
  // ou ate o proximo bloco, o que vier antes — cobre SGML e XML.
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) || [];

  for (const bloco of blocos) {
    const data = dataOfx(campo(bloco, "DTPOSTED"));
    if (!data) continue;

    // NAME e o favorecido; MEMO costuma trazer o detalhe. Juntamos os dois
    // porque bancos diferentes colocam a informacao util em campos diferentes.
    const nome = campo(bloco, "NAME") || "";
    const memo = campo(bloco, "MEMO") || "";
    const descricao = [nome, memo]
      .map((p) => p.trim())
      .filter((p, i, arr) => p && arr.indexOf(p) === i)
      .join(" - ") || "Sem descrição";

    const fitid = campo(bloco, "FITID");
    const valor = numero(campo(bloco, "TRNAMT"));

    transacoes.push({
      // Sem FITID (raro, mas acontece), cai para uma chave derivada. Pior que
      // o FITID, porem melhor que duplicar tudo a cada reimportacao.
      idExterno: fitid || `${data.toISOString().slice(0, 10)}|${valor}|${descricao}`.slice(0, 120),
      data,
      valor,
      descricao,
      documento: extrairDocumento(descricao),
    });
  }

  const datas = transacoes.map((t) => t.data.getTime());

  return {
    identificadorConta,
    banco,
    dataInicio: dataOfx(campo(conteudo, "DTSTART")) || (datas.length ? new Date(Math.min(...datas)) : null),
    dataFim: dataOfx(campo(conteudo, "DTEND")) || (datas.length ? new Date(Math.max(...datas)) : null),
    transacoes,
  };
}
