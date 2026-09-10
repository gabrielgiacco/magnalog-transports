"use client";

import { useState } from "react";

// Registra onde o motorista estava ao enviar o canhoto.
//
// Aparece só DEPOIS da primeira foto, porque é aí que o pedido faz sentido:
// ele acabou de comprovar a entrega, e a coordenada completa a prova.
//
// Não existe leitura silenciosa de localização no navegador — a permissão é
// pedida pelo próprio navegador, sempre. Como o motorista vai ver esse aviso
// de qualquer forma, a tela explica antes para que serve; pedir sem explicar
// só aumenta a chance de ele recusar.

type Estado = "parado" | "pedindo" | "enviado" | "recusado" | "erro";

export function ConfirmarLocal({ token }: { token: string }) {
  const [estado, setEstado] = useState<Estado>("parado");
  const [detalhe, setDetalhe] = useState<string | null>(null);

  const confirmar = () => {
    if (!navigator.geolocation) {
      setEstado("erro");
      setDetalhe("Este celular não permite enviar a localização.");
      return;
    }

    setEstado("pedindo");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`/api/public/upload/${token}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              precisaoM: pos.coords.accuracy,
            }),
          });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Falhou");
          setEstado("enviado");
          setDetalhe(
            pos.coords.accuracy ? `precisão de cerca de ${Math.round(pos.coords.accuracy)} m` : null
          );
        } catch (e) {
          setEstado("erro");
          setDetalhe(e instanceof Error ? e.message : "Não consegui enviar.");
        }
      },
      (err) => {
        // PERMISSION_DENIED = 1. Recusar é legítimo e não é erro.
        setEstado(err.code === 1 ? "recusado" : "erro");
        setDetalhe(err.code === 1 ? null : "Não consegui pegar a localização agora.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  if (estado === "enviado") {
    return (
      <div
        style={{
          background: "#052e16", border: "1px solid #166534", borderRadius: 12,
          padding: "14px 16px", marginBottom: 16, fontSize: 14,
        }}
      >
        ✅ Local confirmado{detalhe ? ` — ${detalhe}` : ""}.
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#1e293b", border: "1px solid #334155", borderRadius: 12,
        padding: "14px 16px", marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        Confirmar que a entrega foi feita no local
      </div>
      <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 12px" }}>
        Envia a sua localização de agora junto do canhoto. Serve de prova de que você esteve no
        endereço — protege você se a entrega for questionada depois. O celular vai pedir permissão.
      </p>

      {estado === "recusado" && (
        <p style={{ fontSize: 13, color: "#fbbf24", margin: "0 0 12px" }}>
          Permissão negada. O canhoto já foi enviado normalmente; só o local não foi registrado.
        </p>
      )}
      {estado === "erro" && detalhe && (
        <p style={{ fontSize: 13, color: "#f87171", margin: "0 0 12px" }}>{detalhe}</p>
      )}

      <button
        onClick={confirmar}
        disabled={estado === "pedindo"}
        style={{
          background: "#334155", color: "#fff", padding: "12px 18px", borderRadius: 10,
          border: "1px solid #475569", fontSize: 14, fontWeight: 600, cursor: "pointer",
          opacity: estado === "pedindo" ? 0.6 : 1, width: "100%",
        }}
      >
        {estado === "pedindo" ? "Pegando a localização..." : "📍 Confirmar local da entrega"}
      </button>
    </div>
  );
}
