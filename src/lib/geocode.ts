// src/lib/geocode.ts

// Nominatim API usage policy requires a unique User-Agent
const NOMINATIM_USER_AGENT = "MagnalogTMS/1.0 (gabriel@magnalog.com.br)";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export interface Coordinates {
  lat: number;
  lng: number;
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
    // Tenta montar a query mais específica possível
    const parts = [];
    
    // As vezes o endereço vem com número. Se não, pelo menos a rua ajuda
    if (address.endereco && address.endereco.trim().length > 0) parts.push(address.endereco.trim());
    if (address.bairro && address.bairro.trim().length > 0) parts.push(address.bairro.trim());
    if (address.cidade && address.cidade.trim().length > 0) parts.push(address.cidade.trim());
    if (address.uf && address.uf.trim().length > 0) parts.push(address.uf.trim());
    
    // Se não tiver pelo menos cidade e UF, a chance de erro é alta, mas tentamos
    if (parts.length === 0) return null;
    
    parts.push("Brasil"); // Restringe a busca ao Brasil
    
    const query = parts.join(", ");
    const url = new URL(NOMINATIM_URL);
    url.searchParams.append("q", query);
    url.searchParams.append("format", "json");
    url.searchParams.append("limit", "1");
    // Se tivermos o CEP, podemos passar para ajudar a refinar (embora o q query seja mais flexível)

    console.log(`[Geocode] Buscando: ${query}`);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        "Accept-Language": "pt-BR",
      },
      // Nominatim requires caching or rate limiting. For now we just fetch.
    });

    if (!response.ok) {
      console.warn(`[Geocode] Erro HTTP ${response.status} ao buscar ${query}`);
      return null;
    }

    const data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
    
    // Fallback: Se não encontrou com a rua, tenta apenas com cidade e UF
    if (parts.length > 3) {
      console.log(`[Geocode] Fallback: buscando apenas por cidade...`);
      const fallbackParts = [];
      if (address.cidade) fallbackParts.push(address.cidade);
      if (address.uf) fallbackParts.push(address.uf);
      fallbackParts.push("Brasil");
      
      const fallbackQuery = fallbackParts.join(", ");
      url.searchParams.set("q", fallbackQuery);
      
      // Respeitar o limite de 1 segundo entre requisições no fallback
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const fbResponse = await fetch(url.toString(), {
        headers: { "User-Agent": NOMINATIM_USER_AGENT }
      });
      
      if (fbResponse.ok) {
        const fbData = await fbResponse.json();
        if (fbData && fbData.length > 0) {
          return {
            lat: parseFloat(fbData[0].lat),
            lng: parseFloat(fbData[0].lon),
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error("[Geocode] Erro ao geocodificar:", error);
    return null;
  }
}

/**
 * Função utilitária para pausar a execução, útil para respeitar limites de taxa (rate limits).
 * @param ms Milissegundos a aguardar.
 */
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
