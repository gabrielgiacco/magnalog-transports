// Montagem de arquivo .eml (RFC 822) — server-only, usa Buffer.
//
// Sem anexo a mensagem não precisa ser multipart: um corpo text/html basta.
//
// Detalhes que decidem se o arquivo funciona ou não:
//  - CRLF em TUDO. Por isso montamos um array de linhas e damos join("\r\n"),
//    em vez de template literal (cujas quebras seriam LF).
//  - Sem From:, Date: ou Message-ID: — assim o Outlook usa a conta padrão.
//  - Assunto em RFC 2047, sem cortar caractere UTF-8 no meio.
//  - Corpo em base64: quoted-printable exigiria escapar todo "=" do HTML.

const CRLF = "\r\n";

// Quebra o base64 em linhas de 76 colunas (múltiplo de 4, sem problema de padding).
function base64Wrap(b64: string): string[] {
  const linhas: string[] = [];
  for (let i = 0; i < b64.length; i += 76) linhas.push(b64.slice(i, i + 76));
  return linhas;
}

// RFC 2047: =?UTF-8?B?...?= . Pedaços de 45 bytes -> 60 chars base64 -> 72 com
// o envelope, abaixo do limite de 75 da encoded-word.
export function encodeHeaderWord(s: string): string {
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  const bytes = Buffer.from(s, "utf8");
  const partes: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    let fim = Math.min(i + 45, bytes.length);
    // Nunca cortar no meio de um caractere multi-byte: 10xxxxxx é continuação.
    while (fim > i && fim < bytes.length && (bytes[fim] & 0xc0) === 0x80) fim--;
    partes.push(`=?UTF-8?B?${bytes.subarray(i, fim).toString("base64")}?=`);
    i = fim;
  }
  return partes.join(CRLF + " ");
}

function normalizaLista(s?: string | null): string {
  return (s || "")
    .split(/[;,]/)
    .map((e) => e.trim())
    .filter(Boolean)
    .join(", ");
}

export function buildEml(o: { para: string; copia?: string | null; assunto: string; html: string }): string {
  const linhas: string[] = [
    // Outlook clássico do Windows abre como rascunho editável por causa disto.
    // O "novo Outlook" e o Outlook web ignoram — a interface não deve prometer.
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    `To: ${normalizaLista(o.para)}`,
  ];

  const cc = normalizaLista(o.copia);
  if (cc) linhas.push(`Cc: ${cc}`);

  linhas.push(
    `Subject: ${encodeHeaderWord(o.assunto)}`,
    "Content-Language: pt-BR",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "", // linha em branco separando headers do corpo
    ...base64Wrap(Buffer.from(o.html, "utf8").toString("base64")),
    "",
  );

  return linhas.join(CRLF);
}

// Nome de arquivo sem acento — evita a encrenca de RFC 2231 no Content-Disposition.
export function nomeArquivoEml(numero: string): string {
  // O filtro abaixo já descarta qualquer caractere fora do ASCII básico.
  const limpo = String(numero || "ticket").replace(/[^a-zA-Z0-9._-]/g, "-");
  return `Ticket-${limpo}.eml`;
}
