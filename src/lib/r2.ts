import { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ENDPOINT = process.env.R2_ENDPOINT!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
export const R2_BUCKET = process.env.R2_BUCKET_NAME || "magnalog-canhotos";

let client: S3Client | null = null;

export function getR2Client() {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 não configurado: defina R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

export function buildObjectKey(entregaId: string, filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = Date.now();
  return `entregas/${entregaId}/${ts}_${safe}`;
}

// URL presignada para upload direto do browser → R2 (evita limite de 4.5MB da Vercel)
export async function presignPut(objectKey: string, mimeType: string, expiresIn = 300) {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: objectKey,
    ContentType: mimeType,
  });
  return getSignedUrl(getR2Client(), cmd, { expiresIn });
}

// URL presignada para leitura (portal cliente, dashboard etc)
export async function presignGet(objectKey: string, expiresIn = 3600) {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: objectKey });
  return getSignedUrl(getR2Client(), cmd, { expiresIn });
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
