"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { formatWeight } from "@/lib/utils";

// Correção para os ícones padrão do Leaflet no Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const defaultIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const depositoIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// A parada selecionada mostra a ordem em que o caminhão passa nela: sem o
// número, uma linha ligando dez pontos não diz por onde ela começa.
function ordemIcon(n: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#f97316;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);color:#fff;font:700 12px/21px system-ui,sans-serif;text-align:center;">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

// Componente para ajustar o zoom do mapa automaticamente baseado nos marcadores
function ChangeView({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [bounds, map]);
  return null;
}

// Componente para centralizar o mapa em uma entrega específica e abrir o popup
function FocusController({ focusId, markerRefs }: { focusId?: string, markerRefs: React.MutableRefObject<Record<string, L.Marker | null>> }) {
  const map = useMap();
  useEffect(() => {
    if (focusId) {
      const marker = markerRefs.current[focusId];
      if (marker) {
        const latLng = marker.getLatLng();
        map.setView(latLng, 16, { animate: true });
        setTimeout(() => marker.openPopup(), 300);
      }
    }
  }, [focusId, map, markerRefs]);
  return null;
}

export interface MapEntrega {
  id: string;
  codigo: string;
  razaoSocial: string;
  cidade: string;
  endereco?: string;
  bairro?: string;
  latitude: number;
  longitude: number;
  pesoTotal: number;
  volumeTotal: number;
  valorDescarga?: number;
  notas?: { numero: string; emitenteRazao?: string }[];
}

interface RouteMapProps {
  entregas: MapEntrega[];
  selectedIds: string[];
  onToggleEntrega: (id: string) => void;
  focusId?: string;
  /** Traçado por estrada, pares [lat, lng] vindos do OSRM */
  trajeto?: [number, number][];
  /** Traçado é linha reta (roteador fora do ar) — muda o estilo da linha */
  trajetoAproximado?: boolean;
  deposito?: { lat: number; lng: number; nome: string; endereco?: string; cidade?: string };
}

export default function RouteMap({ entregas, selectedIds, onToggleEntrega, focusId, trajeto, trajetoAproximado, deposito }: RouteMapProps) {
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  useEffect(() => {
    if (entregas.length > 0) {
      const b = L.latLngBounds(entregas.map(e => [e.latitude, e.longitude] as [number, number]));
      setBounds(b);
    }
  }, [entregas]);

  // Agrupar entregas por mesma coordenada para espalhar marcadores sobrepostos
  const agrupadas = useMemo(() => {
    const map: Record<string, MapEntrega[]> = {};
    entregas.forEach(e => {
      const key = `${e.latitude.toFixed(5)}_${e.longitude.toFixed(5)}`;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [entregas]);

  // Centro inicial caso não haja entregas (São Paulo)
  const defaultCenter: [number, number] = [-23.5505, -46.6333];

  return (
    <MapContainer 
      center={defaultCenter} 
      zoom={10} 
      style={{ height: "100%", width: "100%", borderRadius: "0.5rem", zIndex: 0 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      
      <ChangeView bounds={bounds} />
      <FocusController focusId={focusId} markerRefs={markerRefs} />

      {/* Desenhado antes dos marcadores para a linha passar por baixo deles */}
      {trajeto && trajeto.length > 1 && (
        <Polyline
          positions={trajeto}
          pathOptions={{
            color: trajetoAproximado ? "#94a3b8" : "#2563eb",
            weight: 4,
            opacity: 0.75,
            dashArray: trajetoAproximado ? "8 8" : undefined,
          }}
        />
      )}

      {deposito && trajeto && trajeto.length > 1 && (
        <Marker position={[deposito.lat, deposito.lng]} icon={depositoIcon}>
          <Popup>
            <div className="p-1 min-w-[180px]">
              <div className="font-bold text-sm text-slate-800">{deposito.nome}</div>
              {deposito.endereco && <div className="mt-1 text-xs text-slate-600">{deposito.endereco}</div>}
              {deposito.cidade && <div className="text-xs text-slate-600">{deposito.cidade}</div>}
              <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                Saída e retorno da rota
              </div>
            </div>
          </Popup>
        </Marker>
      )}

      {entregas.map((entrega) => {
        const isSelected = selectedIds.includes(entrega.id);
        
        // Espalhar marcadores sobrepostos em um pequeno círculo
        const key = `${entrega.latitude.toFixed(5)}_${entrega.longitude.toFixed(5)}`;
        const group = agrupadas[key] || [];
        const indexInGroup = group.findIndex(g => g.id === entrega.id);
        
        let lat = entrega.latitude;
        let lng = entrega.longitude;

        if (group.length > 1) {
          const angle = (indexInGroup / group.length) * Math.PI * 2;
          const radius = 0.00015; // ~15 metros
          lat += Math.sin(angle) * radius;
          lng += Math.cos(angle) * radius;
        }

        const position: [number, number] = [lat, lng];
        
        return (
          <Marker 
            key={entrega.id} 
            ref={(r) => { markerRefs.current[entrega.id] = r; }}
            position={position}
            icon={isSelected ? ordemIcon(selectedIds.indexOf(entrega.id) + 1) : defaultIcon}
            eventHandlers={{
              click: () => onToggleEntrega(entrega.id),
            }}
          >
            <Popup>
              <div className="p-1 min-w-[200px]">
                <div className="font-bold text-sm text-slate-800 mb-1">{entrega.razaoSocial}</div>
                
                <div className="text-[10px] uppercase font-bold text-orange-500 tracking-wider mb-2">
                  {entrega.notas && entrega.notas.length > 0 
                    ? entrega.notas.map((n: any) => n.numero).join(", ") 
                    : entrega.codigo}
                </div>
                
                <div className="text-xs text-slate-600 mb-2">
                  {entrega.endereco && <div>{entrega.endereco}</div>}
                  {entrega.bairro && <div>{entrega.bairro} - {entrega.cidade}</div>}
                  {!entrega.endereco && !entrega.bairro && <div>{entrega.cidade}</div>}
                </div>

                <div className="flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100">
                  <span className="font-mono text-xs text-slate-500">{formatWeight(entrega.pesoTotal)}</span>
                  <span className="font-mono text-xs text-slate-500">{entrega.volumeTotal} vol</span>
                </div>
                
                <button 
                  className={`mt-3 w-full py-1.5 rounded text-xs font-bold text-white transition-colors ${
                    isSelected ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleEntrega(entrega.id);
                  }}
                >
                  {isSelected ? "Remover da Rota" : "Adicionar à Rota"}
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
