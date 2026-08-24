import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | MagnaLog TMS", default: "MagnaLog TMS" },
  description: "Sistema de Gestão de Transportes - Carga Fracionada",
  icons: {
    icon: "/favicon.svg",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
        {/* Anti-flash: aplica o tema salvo antes do React montar. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('tms-theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                fontFamily: "'Inter', sans-serif",
                fontSize: "14px",
                boxShadow: "0 10px 15px -3px rgba(0,0,0,0.15)",
              },
              success: { iconTheme: { primary: "#10b981", secondary: "var(--surface)" } },
              error: { iconTheme: { primary: "#ef4444", secondary: "var(--surface)" } },
            }}
          />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
