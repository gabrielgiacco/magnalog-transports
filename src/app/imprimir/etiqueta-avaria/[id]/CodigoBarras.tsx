"use client";

import Barcode from "react-barcode";

// Codigo de barras CODE-128 da chave de acesso (mesmo ajuste do DanfeViewer).
export default function CodigoBarras({ valor }: { valor: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", maxWidth: "100%", overflow: "hidden" }}>
      <Barcode
        value={valor}
        format="CODE128"
        displayValue={false}
        width={1}
        height={38}
        margin={0}
        background="#ffffff"
        lineColor="#000000"
      />
    </div>
  );
}
