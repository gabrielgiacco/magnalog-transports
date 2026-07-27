import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getR2Client, R2_BUCKET } from "@/lib/r2";
import { PutObjectCommand, HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

// Endpoint diagnóstico: tenta uma escrita mínima direto do servidor (sem browser)
// e retorna o erro exato do R2 se houver.
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const results: any = {
    env: {
      hasAccountId: !!process.env.R2_ACCOUNT_ID,
      hasAccessKey: !!process.env.R2_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
      endpoint: process.env.R2_ENDPOINT?.slice(0, 60) + "...",
      bucket: R2_BUCKET,
    },
  };

  const client = getR2Client();

  // Teste 1: HeadBucket — verifica se o bucket existe e o token tem acesso
  try {
    await client.send(new HeadBucketCommand({ Bucket: R2_BUCKET }));
    results.headBucket = "OK";
  } catch (e: any) {
    results.headBucket = {
      error: e.name || "Error",
      message: e.message,
      httpStatusCode: e.$metadata?.httpStatusCode,
      code: e.Code || e.code,
    };
  }

  // Teste 2: ListObjects — verifica permissão de leitura
  try {
    const list = await client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 }));
    results.listObjects = { ok: true, count: list.KeyCount ?? 0 };
  } catch (e: any) {
    results.listObjects = {
      error: e.name,
      message: e.message,
      httpStatusCode: e.$metadata?.httpStatusCode,
      code: e.Code || e.code,
    };
  }

  // Teste 3: PutObject direto — verifica permissão de escrita
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: `_diagnostico/${Date.now()}.txt`,
        Body: "teste r2 " + new Date().toISOString(),
        ContentType: "text/plain",
      })
    );
    results.putObject = "OK - permissão de escrita confirmada";
  } catch (e: any) {
    results.putObject = {
      error: e.name,
      message: e.message,
      httpStatusCode: e.$metadata?.httpStatusCode,
      code: e.Code || e.code,
      fullError: JSON.stringify(e, Object.getOwnPropertyNames(e)).slice(0, 500),
    };
  }

  return NextResponse.json(results, { status: 200 });
}
