"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Pad de assinatura para a tela do motorista.
 *
 * Só canvas + pointer events — dedo, caneta e mouse chegam pelo mesmo evento,
 * então não precisa de biblioteca. Dois detalhes que não são óbvios:
 *
 *  - O fundo é pintado de BRANCO no início e no Limpar. Um PNG transparente
 *    fica invisível em qualquer visualizador escuro, inclusive o do próprio
 *    TMS.
 *  - `touchAction: none` no canvas: sem isso, arrastar o dedo rola a página
 *    em vez de desenhar.
 */
export function AssinaturaPad({ onConfirmar, disabled }: { onConfirmar: (blob: Blob) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  function limpar() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    // Volta a escala do devicePixelRatio para os traços não ficarem borrados.
    const escala = window.devicePixelRatio || 1;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
    setTemTraco(false);
  }

  // Dimensiona o backing store pelo tamanho real na tela × devicePixelRatio.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const escala = window.devicePixelRatio || 1;
    const largura = c.clientWidth;
    c.width = Math.round(largura * escala);
    c.height = Math.round(200 * escala);
    limpar();
  }, []);

  function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function inicio(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = ponto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    desenhando.current = true;
  }

  function movimento(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = ponto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!temTraco) setTemTraco(true);
  }

  function fim() {
    desenhando.current = false;
  }

  function confirmar() {
    canvasRef.current?.toBlob((blob) => { if (blob) onConfirmar(blob); }, "image/png");
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={inicio}
        onPointerMove={movimento}
        onPointerUp={fim}
        onPointerCancel={fim}
        onPointerLeave={fim}
        style={{
          width: "100%", height: 200, display: "block", borderRadius: 10,
          background: "#fff", border: "2px dashed #444", touchAction: "none",
          cursor: disabled ? "not-allowed" : "crosshair", opacity: disabled ? 0.5 : 1,
        }}
      />
      <div style={{ fontSize: 11, color: "#666", textAlign: "center", marginTop: 6 }}>
        Peça para quem recebeu assinar com o dedo
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 12 }}>
        <button
          type="button"
          onClick={limpar}
          disabled={disabled || !temTraco}
          style={{
            background: "#222", color: "#fff", padding: "14px", borderRadius: 12, border: "1px solid #333",
            fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: disabled || !temTraco ? 0.5 : 1,
          }}
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={disabled || !temTraco}
          style={{
            background: "#f97316", color: "#fff", padding: "14px", borderRadius: 12, border: "none",
            fontSize: 16, fontWeight: 700, cursor: "pointer", opacity: disabled || !temTraco ? 0.5 : 1,
          }}
        >
          ✅ Confirmar entrega
        </button>
      </div>
    </div>
  );
}
