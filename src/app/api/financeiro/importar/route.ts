import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

// Parse OFX file content into transactions
function parseOFX(content: string) {
  const transactions: {
    fitId: string;
    tipo: "RECEITA" | "DESPESA";
    valor: number;
    data: Date;
    descricao: string;
  }[] = [];

  // Remove SGML header (everything before <OFX>)
  const ofxStart = content.indexOf("<OFX>");
  if (ofxStart === -1) {
    // Try without the closing tag format (some banks use SGML style)
    // Try to find transaction blocks directly
  }
  
  const ofxContent = ofxStart >= 0 ? content.slice(ofxStart) : content;

  // Find all STMTTRN blocks
  const trnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST))/gi;
  let match;

  while ((match = trnRegex.exec(ofxContent)) !== null) {
    const block = match[1];

    // Extract fields using regex (OFX can be SGML without closing tags)
    const trnType = extractField(block, "TRNTYPE");
    const dtPosted = extractField(block, "DTPOSTED");
    const trnAmt = extractField(block, "TRNAMT");
    const fitId = extractField(block, "FITID");
    const memo = extractField(block, "MEMO") || extractField(block, "NAME") || "Sem descrição";

    if (!trnAmt || !dtPosted) continue;

    const valor = parseFloat(trnAmt.replace(",", "."));
    if (isNaN(valor)) continue;

    // Parse date: YYYYMMDD or YYYYMMDDHHMMSS
    const year = parseInt(dtPosted.slice(0, 4));
    const month = parseInt(dtPosted.slice(4, 6)) - 1;
    const day = parseInt(dtPosted.slice(6, 8));
    const data = new Date(year, month, day);

    if (isNaN(data.getTime())) continue;

    transactions.push({
      fitId: fitId || `${dtPosted}_${trnAmt}_${Math.random().toString(36).slice(2, 8)}`,
      tipo: valor >= 0 ? "RECEITA" : "DESPESA",
      valor: Math.abs(valor),
      data,
      descricao: memo.trim(),
    });
  }

  return transactions;
}

function extractField(block: string, fieldName: string): string | null {
  // Match both SGML style (<FIELD>value) and XML style (<FIELD>value</FIELD>)
  const regex = new RegExp(`<${fieldName}>([^<\\n\\r]+)`, "i");
  const match = block.match(regex);
  return match ? match[1].trim() : null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  if (!["ADMIN", "FINANCEIRO"].includes(user.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const content = await file.text();
    const transactions = parseOFX(content);

    if (transactions.length === 0) {
      return NextResponse.json({ 
        error: "Nenhuma transação encontrada no arquivo. Verifique se o formato é OFX válido." 
      }, { status: 400 });
    }

    // Check for existing FITIDs to avoid duplicates
    const existingIds = await prisma.lancamentoFinanceiro.findMany({
      where: {
        descricao: { in: transactions.map(t => `[OFX] ${t.descricao}`) }
      },
      select: { descricao: true, valor: true, dataVencimento: true }
    });

    // Simple dedup: check by description + valor + date
    const existingSet = new Set(
      existingIds.map(e => `${e.descricao}_${e.valor}_${e.dataVencimento.toISOString().slice(0, 10)}`)
    );

    const newTransactions = transactions.filter(t => {
      const key = `[OFX] ${t.descricao}_${t.valor}_${t.data.toISOString().slice(0, 10)}`;
      return !existingSet.has(key);
    });

    if (newTransactions.length === 0) {
      return NextResponse.json({ 
        message: "Todas as transações deste arquivo já foram importadas anteriormente.",
        total: 0,
        duplicadas: transactions.length
      });
    }

    // Create all new lancamentos
    const created = await prisma.lancamentoFinanceiro.createMany({
      data: newTransactions.map(t => ({
        descricao: `[OFX] ${t.descricao}`,
        tipo: t.tipo,
        valor: t.valor,
        dataVencimento: t.data,
        dataPagamento: t.data, // OFX transactions are already settled
        status: "PAGO" as const,
        favorecido: t.descricao,
      }))
    });

    return NextResponse.json({
      message: `${created.count} lançamentos importados com sucesso!`,
      total: created.count,
      duplicadas: transactions.length - newTransactions.length
    });

  } catch (error: any) {
    console.error("Erro ao importar OFX:", error);
    return NextResponse.json({ error: "Erro ao processar arquivo: " + (error.message || "desconhecido") }, { status: 500 });
  }
}
