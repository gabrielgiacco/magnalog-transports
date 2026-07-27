import { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Trim protege contra espaços/quebras invisíveis coladas ao definir env var
const R2_ENDPOINT = (process.env.R2_ENDPOINT || "").trim();
const R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID || "").trim();
const R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
export const R2_BUCKET = (process.env.R2_BUCKET_NAME || "magnalog-canhotos").trim();

let client: S3Client | null = null;

function validateEndpoint(ep: string) {
  if (!ep) throw new Error("R2_ENDPOINT vazio");
  let parsed: URL;
  try { parsed = new URL(ep); }
  catch { throw new Error(`R2_ENDPOINT inválido (não é URL): "${ep.slice(0, 40)}..." (len=${ep.length})`); }
  if (parsed.protocol !== "https:") throw new Error(`R2_ENDPOINT precisa começar com https:// (recebido: ${parsed.protocol})`);
  if (!parsed.hostname.endsWith(".r2.cloudflarestorage.com")) {
    throw new Error(`R2_ENDPOINT hostname inesperado: "${parsed.hostname}" — deveria terminar em .r2.cloudflarestorage.com`);
  }
  if (parsed.pathname && parsed.pathname !== "/") {
    throw new Error(`R2_ENDPOINT não deve ter path (encontrado: "${parsed.pathname}") — remova qualquer coisa após o domínio`);
  }
}

export function getR2Client() {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 não configurado: defina R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  }
  validateEndpoint(R2_ENDPOINT);
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      forcePathStyle: true, // R2 recomenda path-style
      // R2 não suporta bem os headers de checksum novos do SDK v3 em URLs presignadas —
      // sem isso, o R2 responde 403 no PUT ("checksum inválido") e o browser reporta
      // como "CORS blocked" (porque erro 403 não vem com Access-Control-Allow-Origin).
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });

    // Belt-and-suspenders: remove qualquer header de checksum ANTES da assinatura.
    // Necessário porque em algumas versões do SDK v3, requestChecksumCalculation
    // sozinho não impede que os headers X-Amz-Sdk-Checksum-Algorithm e X-Amz-Checksum-*
    // sejam adicionados na URL presignada.
    client.middlewareStack.add(
      (next: any) => async (args: any) => {
        const h = args?.request?.headers;
        if (h) {
          for (const k of Object.keys(h)) {
            const lower = k.toLowerCase();
            if (lower.startsWith("x-amz-checksum-") || lower === "x-amz-sdk-checksum-algorithm") {
              delete h[k];
            }
          }
        }
        return next(args);
      },
      { step: "build", name: "stripR2ChecksumHeaders", priority: "high" }
    );
  }
  return client;
}

export function buildObjectKey(entregaId: string, filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = Date.now();
  return `entregas/${entregaId}/${ts}_${safe}`;
}

// Headers de checksum que o SDK v3 tenta injetar mas o R2 não aceita em URLs presignadas.
// Marcamos como unsignable + unhoistable pra eles saírem tanto da assinatura quanto da querystring.
const R2_CHECKSUM_HEADERS = new Set([
  "x-amz-sdk-checksum-algorithm",
  "x-amz-checksum-crc32",
  "x-amz-checksum-crc32c",
  "x-amz-checksum-sha1",
  "x-amz-checksum-sha256",
  "x-amz-checksum-crc64nvme",
]);

// URL presignada para upload direto do browser → R2 (evita limite de 4.5MB da Vercel)
export async function presignPut(objectKey: string, mimeType: string, expiresIn = 300) {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: objectKey,
    ContentType: mimeType,
  });
  return getSignedUrl(getR2Client(), cmd, {
    expiresIn,
    unhoistableHeaders: R2_CHECKSUM_HEADERS,
    unsignableHeaders: R2_CHECKSUM_HEADERS,
  });
}

// URL presignada para leitura (portal cliente, dashboard etc)
export async function presignGet(objectKey: string, expiresIn = 3600) {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: objectKey });
  return getSignedUrl(getR2Client(), cmd, {
    expiresIn,
    unhoistableHeaders: R2_CHECKSUM_HEADERS,
    unsignableHeaders: R2_CHECKSUM_HEADERS,
  });
}

export async function deleteObject(objectKey: string) {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: objectKey }));
}

export async function objectExists(objectKey: string) {
  try {
    await getR2Client().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: objectKey }));
    return true;
  } catch {
    return false;
  }
}
