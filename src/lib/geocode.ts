// src/lib/geocode.ts

// Nominatim API usage policy requires a unique User-Agent
const NOMINATIM_USER_AGENT = "MagnalogTMS/1.0 (gabriel@magnalog.com.br)";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Função utilitária para pausar a execução, útil para respeitar limites de taxa (rate limits).
 * @param ms Milissegundos a aguardar.
 */
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchNominatim(url: URL): Promise<Coordinates | null> {
  try {
    // Nominatim requires 1 request per second
    await delay(1100);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        "Accept-Language": "pt-BR",
      },
    });

    if (!response.ok) {
      console.warn(`[Geocode] Erro HTTP ${response.status} ao buscar ${url.toString()}`);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
    return null;
  } catch (error) {
    console.error("[Geocode] Erro na requisição Nominatim:", error);
    return null;
  }
}

/**
 * Converte um endereço em coordenadas geográficas usando OpenStreetMap (Nominatim).
 * @param address - Objeto com os campos do endereço.
 * @returns Coordenadas { lat, lng } ou null se não encontrar ou houver erro.
 */
export async function geocodeAddress(address: {
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}): Promise<Coordinates | null> {
  try {
    const normalize = (str?: string | null) => {
      if (!str) return "";
      return str.trim()
        .replace(/\bSET\b/gi, "Setor")
        .replace(/\bJD\b/gi, "Jardim")
        .replace(/\bVL\b/gi, "Vila")
        .replace(/\bAV\b/gi, "Avenida")
        .replace(/\bR\b/gi, "Rua")
        .replace(/\bRES\b/gi, "Residencial")
        .replace(/\bCOND\b/gi, "Condominio")
        .replace(/\bPQ\b/gi, "Parque")
        .replace(/\bBRANC\b/gi, "Branco");
    };

    const endereco = normalize(address.endereco);
    const bairro = normalize(address.bairro);
    const cidade = normalize(address.cidade);
    const uf = normalize(address.uf);
    const cep = address.cep ? address.cep.replace(/\D/g, "") : "";

    // 1. Full Address
    if (endereco && cidade && uf) {
      const parts = [endereco];
      if (bairro) parts.push(bairro);
      parts.push(cidade);
      parts.push(uf);
      parts.push("Brasil");
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set("q", parts.join(", "));
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      console.log(`[Geocode] Tentativa 1 (Completo): ${parts.join(", ")}`);
      const coords = await fetchNominatim(url);
      if (coords) return coords;
    }

    // 2. Fallback by CEP
    if (cep && cep.length === 8) {
      const url = new URL(NOMINATIM_URL);
      // Nominatim accepts postalcode and country for structured queries
      url.searchParams.set("postalcode", cep);
      url.searchParams.set("country", "Brasil");
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      console.log(`[Geocode] Tentativa 2 (CEP): ${cep}`);
      const coords = await fetchNominatim(url);
      if (coords) return coords;
    }

    // 3. Fallback by Bairro
    if (bairro && cidade && uf) {
      const parts = [bairro, cidade, uf, "Brasil"];
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set("q", parts.join(", "));
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      console.log(`[Geocode] Tentativa 3 (Bairro): ${parts.join(", ")}`);
      const coords = await fetchNominatim(url);
      if (coords) return coords;
    }

    // 4. Fallback by Cidade (Last Resort)
    if (cidade && uf) {
      const parts = [cidade, uf, "Brasil"];
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set("q", parts.join(", "));
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      console.log(`[Geocode] Tentativa 4 (Cidade): ${parts.join(", ")}`);
      const coords = await fetchNominatim(url);
      if (coords) return coords;
    }

    return null;
  } catch (error) {
    console.error("[Geocode] Erro ao geocodificar:", error);
    return null;
  }
}
