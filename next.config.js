/** @type {import('next').NextConfig} */

// Cabeçalhos de segurança. Os quatro primeiros são de risco zero e vão
// aplicados. O CSP vai em Report-Only de propósito: o host do R2 vem de env
// var (R2_ENDPOINT) e não dá para enumerar aqui, e as pré-visualizações de PDF
// e as fotos de canhoto carregam de lá. Em modo relatório ele não bloqueia
// nada — só registra a violação no console do navegador, o que revela as
// origens que faltam. Depois de conferir o console em produção, trocar a chave
// para "Content-Security-Policy" para passar a valer de fato.
const csp = [
  "default-src 'self'",
  // O ponto que realmente importa contra XSS. 'unsafe-inline' é exigido pelo
  // script de hidratação do Next sem nonce.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // https: amplo: R2 (host em env var), tiles do OpenStreetMap e avatares Google.
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  // Pré-visualização de PDF em <iframe> com URL presignada do R2.
  "frame-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Impede que o id de documento presente na URL de /imprimir vaze no Referer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera=(self) porque /upload/[token] usa capture="environment" para o
  // motorista fotografar o canhoto. Bloquear aqui quebraria isso.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
  images: {
    domains: ["lh3.googleusercontent.com", "avatars.githubusercontent.com"],
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
module.exports = nextConfig;
