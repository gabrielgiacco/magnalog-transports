"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ScanLine, X } from "lucide-react";

const FORMATOS = ["itf", "ean_13", "ean_8", "code_128", "upc_a"];
const MSG_INDISPONIVEL = "Câmera indisponível — use o leitor ou digite o código";

interface Props {
  onLer: (codigo: string) => void;
  desabilitado?: boolean;
  /** Para de roubar o foco (ex.: bottom sheet aberto). */
  pausado?: boolean;
}

export function LeitorCodigo({ onLer, desabilitado, pausado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pararRef = useRef<(() => void) | null>(null);
  const ultimaRef = useRef({ codigo: "", em: 0 });
  const onLerRef = useRef(onLer);
  useEffect(() => { onLerRef.current = onLer; }, [onLer]);
  const [valor, setValor] = useState("");
  const [camera, setCamera] = useState(false);
  const [erroCamera, setErroCamera] = useState(false);

  const focar = useCallback(() => {
    if (pausado || desabilitado) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [pausado, desabilitado]);

  useEffect(() => { if (!camera) focar(); }, [focar, camera]);

  // Leitura vinda da camera: ignora o mesmo codigo repetido em 1,5s
  const lerCamera = useCallback((codigo: string) => {
    const agora = Date.now();
    const u = ultimaRef.current;
    if (codigo === u.codigo && agora - u.em < 1500) return;
    ultimaRef.current = { codigo, em: agora };
    navigator.vibrate?.(80);
    onLerRef.current(codigo);
  }, []);

  const fechar = useCallback(() => {
    pararRef.current?.();
    pararRef.current = null;
    setCamera(false);
  }, []);

  useEffect(() => () => { pararRef.current?.(); }, []);

  // Abre a camera quando o painel de video e montado
  useEffect(() => {
    if (!camera) return;
    let ativo = true;
    (async () => {
      const video = videoRef.current;
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !video) throw new Error("sem camera");
        const BD = (window as any).BarcodeDetector;
        if (BD) {
          const suportados: string[] = await BD.getSupportedFormats();
          const formats = FORMATOS.filter((f) => suportados.includes(f));
          const detector = new BD({ formats });
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          if (!ativo) { stream.getTracks().forEach((t) => t.stop()); return; }
          video.srcObject = stream;
          await video.play().catch(() => {});
          const timer = setInterval(async () => {
            if (video.readyState < 2) return;
            try {
              const achados = await detector.detect(video);
              if (achados[0]?.rawValue) lerCamera(achados[0].rawValue);
            } catch { /* quadro ruim, tenta no proximo */ }
          }, 250);
          pararRef.current = () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const leitor = new BrowserMultiFormatReader();
          const controles = await leitor.decodeFromVideoDevice(undefined, video, (res) => {
            if (res) lerCamera(res.getText());
          });
          if (!ativo) { controles.stop(); return; }
          pararRef.current = () => controles.stop();
        }
      } catch {
        if (ativo) { setErroCamera(true); setCamera(false); }
      }
    })();
    return () => { ativo = false; pararRef.current?.(); pararRef.current = null; };
  }, [camera, lerCamera]);

  function enviar() {
    const v = valor.trim();
    setValor("");
    if (v && !desabilitado) onLer(v);
    focar();
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine size={18} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text2)" }} />
          <input
            ref={inputRef}
            value={valor}
            disabled={desabilitado}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Bipe ou digite o código"
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }}
            onBlur={() => setTimeout(() => { if (!camera) focar(); }, 150)}
            className="w-full h-12 pl-10 pr-3 rounded-lg text-base outline-none"
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </div>
        <button
          type="button"
          onClick={() => { setErroCamera(false); if (camera) fechar(); else setCamera(true); }}
          className="h-12 px-4 rounded-lg font-semibold text-sm inline-flex items-center gap-2 bg-orange-500 text-white active:scale-95"
        >
          <Camera size={18} /> Câmera
        </button>
      </div>
      {erroCamera && <p className="text-xs text-amber-400">{MSG_INDISPONIVEL}</p>}
      {camera && (
        <div className="relative rounded-lg overflow-hidden bg-black">
          <video ref={videoRef} playsInline muted className="w-full max-h-64 object-cover" />
          <button
            type="button"
            onClick={fechar}
            className="absolute top-2 right-2 h-10 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1 bg-black/70 text-white"
          >
            <X size={16} /> Fechar câmera
          </button>
        </div>
      )}
    </div>
  );
}
